'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/response');
const jobs = require('../services/agentJob.service');
const agentHeartbeatSvc = require('../services/agentHeartbeat.service');
const { Device } = require('../models/device.model');

/** Actions the polling LAN agent may claim and run locally. */
const POLLABLE_ACTIONS = new Set([
  'probe',
  'pull_attendance',
  'zk_probe_snapshot',
  'list_users',
  'unlock_device',
  'set_user_privilege',
]);

const VALID_ACTIONS = POLLABLE_ACTIONS;

function getAgentBearerToken(req) {
  const raw = String(req.headers.authorization || '').trim();
  const m = raw.match(/^Bearer\s+(.*)$/i);
  if (!m) return '';
  return String(m[1] || '').trim();
}

/** Set AGENT_AUTH_DEBUG=1 to log why agent Bearer auth failed (remove after debugging). */
function logAgentAuthDebugFailure(req, token, expected) {
  if (String(process.env.AGENT_AUTH_DEBUG || '').trim() !== '1') return;
  const rawAuth = String(req.headers.authorization || '');
  // eslint-disable-next-line no-console
  console.error('[TEMP AGENT_AUTH_DEBUG] requireAgentAuth rejected', {
    receivedToken: token,
    expectedToken: expected,
    receivedLen: token.length,
    expectedLen: expected.length,
    equal: token === expected,
    rawAuthorizationLen: rawAuth.length,
    rawAuthorizationPrefix: rawAuth.slice(0, 24),
  });
}

function requireAgentAuth(req, res) {
  const token = getAgentBearerToken(req);
  const expected = String(process.env.AGENT_SHARED_TOKEN || process.env.AGENT_TOKEN || '').trim();
  if (!expected) {
    sendError(res, 'AGENT_SHARED_TOKEN is not configured on the server', 500, 'AGENT_CONFIG_ERROR');
    return false;
  }
  if (!token || token !== expected) {
    logAgentAuthDebugFailure(req, token, expected);
    sendError(res, 'Agent unauthorized', 401, 'AGENT_UNAUTHORIZED');
    return false;
  }

  const agentId = String(req.query.agent_id || req.body?.agent_id || '').trim();
  if (!agentId) {
    sendError(res, 'agent_id is required', 422, 'VALIDATION_ERROR');
    return false;
  }

  const allowedList = String(process.env.ALLOWED_AGENT_IDS || '').split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowedList.length > 0 && !allowedList.includes(agentId)) {
    sendError(res, 'Unknown or disabled agent_id', 403, 'AGENT_FORBIDDEN');
    return false;
  }

  req.agentId = agentId;
  return true;
}

/**
 * POST /api/device-agent/jobs (JWT)
 * Queue work for a LAN agent. Body: { agent_id, action, device_id?, device_ip?, ... }
 */
const createDeviceAgentJob = asyncHandler(async (req, res) => {
  const companyId = req.user.company_id;
  const body = req.body || {};
  const agentId = String(body.agent_id || '').trim();
  const action = String(body.action || '').trim().toLowerCase();

  if (!agentId) return sendError(res, 'agent_id is required', 422, 'VALIDATION_ERROR');
  if (!POLLABLE_ACTIONS.has(action)) {
    return sendError(res, `Unsupported action: ${action || '(empty)'}`, 422, 'VALIDATION_ERROR');
  }

  const allowedList = String(process.env.ALLOWED_AGENT_IDS || '').split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowedList.length > 0 && !allowedList.includes(agentId)) {
    return sendError(res, 'agent_id is not in ALLOWED_AGENT_IDS on this server', 403, 'AGENT_FORBIDDEN');
  }

  let timeoutMs = Number.isFinite(Number(body.timeout_ms)) ? Number(body.timeout_ms) : 800;
  let payload = {};

  if (action === 'probe') {
    const deviceIp = String(body.device_ip || '').trim();
    if (!deviceIp) return sendError(res, 'device_ip is required', 422, 'VALIDATION_ERROR');
    payload = {
      device_ip: deviceIp,
      port: Number.isFinite(Number(body.port)) && Number(body.port) > 0 ? Number(body.port) : 80,
    };
    timeoutMs = Math.min(5000, Math.max(200, timeoutMs));
  } else if (action === 'pull_attendance') {
    const deviceId = Number(body.device_id);
    if (!Number.isFinite(deviceId) || deviceId < 1) {
      return sendError(res, 'device_id is required for pull_attendance', 422, 'VALIDATION_ERROR');
    }
    const dev = await Device.findOne({ where: { id: deviceId, company_id: companyId } });
    if (!dev) return sendError(res, 'Device not found', 404, 'NOT_FOUND');
    const deviceIp = String(body.device_ip || dev.ip_address || '').trim();
    if (!deviceIp) return sendError(res, 'Device has no ip_address; set IP on the device record', 422, 'VALIDATION_ERROR');
    const port = Number.isFinite(Number(body.port)) && Number(body.port) > 0 ? Number(body.port) : 4370;
    const socketTimeout = Number.isFinite(Number(body.socket_timeout_ms))
      ? Math.min(180000, Math.max(8000, Number(body.socket_timeout_ms)))
      : 120000;
    timeoutMs = socketTimeout;
    payload = {
      device_ip: deviceIp,
      port,
      comm_key: body.comm_key != null ? String(body.comm_key) : (dev.comm_key || undefined),
      socket_timeout_ms: socketTimeout,
      device_id: dev.id,
      company_id: companyId,
      auto_ingest: body.auto_ingest !== false,
      ingest_options: {
        date_from: body.date_from != null ? String(body.date_from) : undefined,
        date_to: body.date_to != null ? String(body.date_to) : undefined,
        auto_process: body.auto_process !== false,
        overwrite_attendance: body.overwrite_attendance !== false,
        max_records: Number.isFinite(Number(body.max_records)) ? Number(body.max_records) : 12000,
      },
    };
  } else if (action === 'zk_probe_snapshot') {
    const deviceId = Number(body.device_id);
    let deviceIp = String(body.device_ip || '').trim();
    let commKey = body.comm_key != null ? String(body.comm_key) : undefined;
    if (Number.isFinite(deviceId) && deviceId > 0) {
      const dev = await Device.findOne({ where: { id: deviceId, company_id: companyId } });
      if (!dev) return sendError(res, 'Device not found', 404, 'NOT_FOUND');
      deviceIp = deviceIp || String(dev.ip_address || '').trim();
      commKey = commKey != null ? commKey : (dev.comm_key || undefined);
    }
    if (!deviceIp) return sendError(res, 'device_ip or device_id is required', 422, 'VALIDATION_ERROR');
    const port = Number.isFinite(Number(body.port)) && Number(body.port) > 0 ? Number(body.port) : 4370;
    const socketTimeout = Number.isFinite(Number(body.socket_timeout_ms))
      ? Math.min(120000, Math.max(2000, Number(body.socket_timeout_ms)))
      : 8000;
    timeoutMs = socketTimeout;
    payload = {
      device_ip: deviceIp,
      port,
      comm_key: commKey,
      socket_timeout_ms: socketTimeout,
      udp_local_port: Number.isFinite(Number(body.udp_local_port)) ? Number(body.udp_local_port) : undefined,
      minimal_probe: body.minimal_probe === true,
      include_users: body.include_users !== false,
      max_users: Number.isFinite(Number(body.max_users)) ? Math.min(2000, Number(body.max_users)) : 80,
      include_attendance_size: body.include_attendance_size === true,
    };
  } else if (action === 'list_users') {
    const deviceId = Number(body.device_id);
    let deviceIp = String(body.device_ip || '').trim();
    let commKey = body.comm_key != null ? String(body.comm_key) : undefined;
    if (Number.isFinite(deviceId) && deviceId > 0) {
      const dev = await Device.findOne({ where: { id: deviceId, company_id: companyId } });
      if (!dev) return sendError(res, 'Device not found', 404, 'NOT_FOUND');
      deviceIp = deviceIp || String(dev.ip_address || '').trim();
      commKey = commKey != null ? commKey : (dev.comm_key || undefined);
    }
    if (!deviceIp) return sendError(res, 'device_ip or device_id is required', 422, 'VALIDATION_ERROR');
    const port = Number.isFinite(Number(body.port)) && Number(body.port) > 0 ? Number(body.port) : 4370;
    const socketTimeout = Number.isFinite(Number(body.socket_timeout_ms))
      ? Math.min(120000, Math.max(8000, Number(body.socket_timeout_ms)))
      : 45000;
    timeoutMs = socketTimeout;
    payload = {
      device_ip: deviceIp,
      port,
      comm_key: commKey,
      socket_timeout_ms: socketTimeout,
      udp_local_port: Number.isFinite(Number(body.udp_local_port)) ? Number(body.udp_local_port) : 5000,
    };
  } else if (action === 'unlock_device') {
    const deviceId = Number(body.device_id);
    let deviceIp = String(body.device_ip || '').trim();
    let commKey = body.comm_key != null ? String(body.comm_key) : undefined;
    if (Number.isFinite(deviceId) && deviceId > 0) {
      const dev = await Device.findOne({ where: { id: deviceId, company_id: companyId } });
      if (!dev) return sendError(res, 'Device not found', 404, 'NOT_FOUND');
      deviceIp = deviceIp || String(dev.ip_address || '').trim();
      commKey = commKey != null ? commKey : (dev.comm_key || undefined);
    }
    if (!deviceIp) return sendError(res, 'device_ip or device_id is required', 422, 'VALIDATION_ERROR');
    const port = Number.isFinite(Number(body.port)) && Number(body.port) > 0 ? Number(body.port) : 4370;
    const socketTimeout = Number.isFinite(Number(body.socket_timeout_ms))
      ? Math.min(120000, Math.max(8000, Number(body.socket_timeout_ms)))
      : 50000;
    timeoutMs = socketTimeout;
    payload = { device_ip: deviceIp, port, comm_key: commKey, socket_timeout_ms: socketTimeout };
  } else if (action === 'set_user_privilege') {
    const uid = Number(body.uid);
    if (!Number.isInteger(uid) || uid < 1) {
      return sendError(res, 'uid is required for set_user_privilege', 422, 'VALIDATION_ERROR');
    }
    const deviceId = Number(body.device_id);
    let deviceIp = String(body.device_ip || '').trim();
    let commKey = body.comm_key != null ? String(body.comm_key) : undefined;
    if (Number.isFinite(deviceId) && deviceId > 0) {
      const dev = await Device.findOne({ where: { id: deviceId, company_id: companyId } });
      if (!dev) return sendError(res, 'Device not found', 404, 'NOT_FOUND');
      deviceIp = deviceIp || String(dev.ip_address || '').trim();
      commKey = commKey != null ? commKey : (dev.comm_key || undefined);
    }
    if (!deviceIp) return sendError(res, 'device_ip or device_id is required', 422, 'VALIDATION_ERROR');
    const port = Number.isFinite(Number(body.port)) && Number(body.port) > 0 ? Number(body.port) : 4370;
    const socketTimeout = Number.isFinite(Number(body.socket_timeout_ms))
      ? Math.min(120000, Math.max(8000, Number(body.socket_timeout_ms)))
      : 45000;
    timeoutMs = socketTimeout;
    payload = {
      device_ip: deviceIp,
      port,
      comm_key: commKey,
      socket_timeout_ms: socketTimeout,
      uid,
      is_admin: body.is_admin === true,
    };
  }

  const job = await jobs.createJob({
    agent_id: agentId,
    action,
    timeout_ms: timeoutMs,
    payload,
  });

  sendSuccess(res, {
    job_id: job.id,
    status: job.status,
    agent_id: job.agent_id,
    action: job.action,
  }, 'تم إنشاء مهمة للوكيل. راقب الحالة عبر /api/job-status/:id');
});

/**
 * POST /api/agent/enqueue-job (Bearer AGENT_SHARED_TOKEN)
 * Same job queue as UI; for scripts / auto-pull on the LAN PC.
 */
const enqueueAgentJob = asyncHandler(async (req, res) => {
  if (!requireAgentAuth(req, res)) return;
  const body = req.body || {};
  if (String(body.agent_id || '').trim() !== req.agentId) {
    return sendError(res, 'agent_id must match authenticated agent', 403, 'AGENT_FORBIDDEN');
  }

  const action = String(body.action || '').trim().toLowerCase();
  if (!POLLABLE_ACTIONS.has(action)) {
    return sendError(res, `Unsupported action: ${action || '(empty)'}`, 422, 'VALIDATION_ERROR');
  }

  const companyId = Number(body.company_id);
  if (!Number.isFinite(companyId) || companyId < 1) {
    return sendError(res, 'company_id is required', 422, 'VALIDATION_ERROR');
  }

  let timeoutMs = Number.isFinite(Number(body.timeout_ms)) ? Number(body.timeout_ms) : 800;
  let payload = {};

  if (action === 'probe') {
    const deviceIp = String(body.device_ip || '').trim();
    if (!deviceIp) return sendError(res, 'device_ip is required', 422, 'VALIDATION_ERROR');
    payload = {
      device_ip: deviceIp,
      port: Number.isFinite(Number(body.port)) && Number(body.port) > 0 ? Number(body.port) : 80,
    };
    timeoutMs = Math.min(5000, Math.max(200, timeoutMs));
  } else {
    const deviceId = Number(body.device_id);
    if (!Number.isFinite(deviceId) || deviceId < 1) {
      return sendError(res, 'device_id is required', 422, 'VALIDATION_ERROR');
    }
    const dev = await Device.findOne({ where: { id: deviceId, company_id: companyId } });
    if (!dev) return sendError(res, 'Device not found for this company_id', 404, 'NOT_FOUND');
    const deviceIp = String(body.device_ip || dev.ip_address || '').trim();
    if (!deviceIp) return sendError(res, 'Device has no ip_address', 422, 'VALIDATION_ERROR');
    const port = Number.isFinite(Number(body.port)) && Number(body.port) > 0 ? Number(body.port) : 4370;

    if (action === 'pull_attendance') {
      const socketTimeout = Number.isFinite(Number(body.socket_timeout_ms))
        ? Math.min(180000, Math.max(8000, Number(body.socket_timeout_ms)))
        : 120000;
      timeoutMs = socketTimeout;
      payload = {
        device_ip: deviceIp,
        port,
        comm_key: body.comm_key != null ? String(body.comm_key) : (dev.comm_key || undefined),
        socket_timeout_ms: socketTimeout,
        device_id: dev.id,
        company_id: companyId,
        auto_ingest: body.auto_ingest !== false,
        ingest_options: {
          date_from: body.date_from != null ? String(body.date_from) : undefined,
          date_to: body.date_to != null ? String(body.date_to) : undefined,
          auto_process: body.auto_process !== false,
          overwrite_attendance: body.overwrite_attendance !== false,
          max_records: Number.isFinite(Number(body.max_records)) ? Number(body.max_records) : 12000,
        },
      };
    } else if (action === 'zk_probe_snapshot') {
      const socketTimeout = Number.isFinite(Number(body.socket_timeout_ms))
        ? Math.min(120000, Math.max(2000, Number(body.socket_timeout_ms)))
        : 8000;
      timeoutMs = socketTimeout;
      payload = {
        device_ip: deviceIp,
        port,
        comm_key: body.comm_key != null ? String(body.comm_key) : (dev.comm_key || undefined),
        socket_timeout_ms: socketTimeout,
        udp_local_port: Number.isFinite(Number(body.udp_local_port)) ? Number(body.udp_local_port) : undefined,
        minimal_probe: body.minimal_probe === true,
        include_users: body.include_users !== false,
        max_users: Number.isFinite(Number(body.max_users)) ? Math.min(2000, Number(body.max_users)) : 80,
        include_attendance_size: body.include_attendance_size === true,
      };
    } else if (action === 'list_users') {
      const socketTimeout = Number.isFinite(Number(body.socket_timeout_ms))
        ? Math.min(120000, Math.max(8000, Number(body.socket_timeout_ms)))
        : 45000;
      timeoutMs = socketTimeout;
      payload = {
        device_ip: deviceIp,
        port,
        comm_key: body.comm_key != null ? String(body.comm_key) : (dev.comm_key || undefined),
        socket_timeout_ms: socketTimeout,
        udp_local_port: Number.isFinite(Number(body.udp_local_port)) ? Number(body.udp_local_port) : 5000,
      };
    } else if (action === 'unlock_device') {
      const socketTimeout = Number.isFinite(Number(body.socket_timeout_ms))
        ? Math.min(120000, Math.max(8000, Number(body.socket_timeout_ms)))
        : 50000;
      timeoutMs = socketTimeout;
      payload = {
        device_ip: deviceIp,
        port,
        comm_key: body.comm_key != null ? String(body.comm_key) : (dev.comm_key || undefined),
        socket_timeout_ms: socketTimeout,
      };
    } else if (action === 'set_user_privilege') {
      const uid = Number(body.uid);
      if (!Number.isInteger(uid) || uid < 1) {
        return sendError(res, 'uid is required', 422, 'VALIDATION_ERROR');
      }
      const socketTimeout = Number.isFinite(Number(body.socket_timeout_ms))
        ? Math.min(120000, Math.max(8000, Number(body.socket_timeout_ms)))
        : 45000;
      timeoutMs = socketTimeout;
      payload = {
        device_ip: deviceIp,
        port,
        comm_key: body.comm_key != null ? String(body.comm_key) : (dev.comm_key || undefined),
        socket_timeout_ms: socketTimeout,
        uid,
        is_admin: body.is_admin === true,
      };
    }
  }

  const job = await jobs.createJob({
    agent_id: req.agentId,
    action,
    timeout_ms: timeoutMs,
    payload,
  });

  sendSuccess(res, {
    job_id: job.id,
    status: job.status,
    agent_id: job.agent_id,
    action: job.action,
  }, 'Job queued for agent');
});

/** @deprecated use createDeviceAgentJob */
const createProbeJob = createDeviceAgentJob;

/**
 * GET /api/agent/jobs?agent_id=office_1
 */
const pollJobs = asyncHandler(async (req, res) => {
  if (!requireAgentAuth(req, res)) return;

  const limit = Number.isFinite(Number(req.query.limit)) ? Number(req.query.limit) : 3;
  const list = await jobs.claimPendingJobs(req.agentId, { limit });

  const out = list
    .filter((j) => VALID_ACTIONS.has(j.action))
    .map((j) => ({
      job_id: j.id,
      action: j.action,
      timeout_ms: j.timeout_ms,
      ...(typeof j.payload === 'object' && j.payload ? j.payload : {}),
    }));

  return res.json({ success: true, jobs: out });
});

/**
 * POST /api/agent/job-result
 */
const submitResult = asyncHandler(async (req, res) => {
  if (!requireAgentAuth(req, res)) return;

  const jobId = String(req.body?.job_id || '').trim();
  const statusRaw = String(req.body?.status || '').trim().toLowerCase();
  const allowedStatuses = new Set(['success', 'failed', 'timeout']);

  if (!jobId) return sendError(res, 'job_id is required', 422, 'VALIDATION_ERROR');
  if (statusRaw && !allowedStatuses.has(statusRaw)) {
    return sendError(res, 'Invalid status', 422, 'VALIDATION_ERROR');
  }

  const job = await jobs.getJob(jobId);
  if (!job) return sendError(res, 'Job not found', 404, 'NOT_FOUND');
  if (job.agent_id !== req.agentId) {
    return sendError(res, 'Job does not belong to this agent', 403, 'AGENT_FORBIDDEN');
  }

  const updated = await jobs.completeJob(jobId, {
    status: statusRaw || undefined,
    result: req.body?.result || null,
    error: req.body?.error || null,
  });

  if (
    updated
    && updated.action === 'pull_attendance'
    && statusRaw === 'success'
    && updated.payload?.auto_ingest
    && updated.payload?.device_id
    && updated.payload?.company_id
    && req.body?.result
    && req.body.result.ok === true
  ) {
    try {
      const { importZkAttendancesDirectToDeviceLogs } = require('../services/device-proxy.service');
      const ingestOpts = updated.payload.ingest_options && typeof updated.payload.ingest_options === 'object'
        ? updated.payload.ingest_options
        : {};
      await importZkAttendancesDirectToDeviceLogs(
        updated.payload.device_id,
        updated.payload.company_id,
        { ...req.body.result, options: ingestOpts },
      );
    } catch (ingestErr) {
      // eslint-disable-next-line no-console
      console.error('[agent-job] pull_attendance ingest failed:', ingestErr?.message || ingestErr);
    }
  }

  sendSuccess(res, {
    job_id: updated.id,
    status: updated.status,
  });
});

/**
 * POST /api/agent/heartbeat — office agent outbound health (Bearer AGENT_SHARED_TOKEN).
 * Body: { agent_id (optional if query), company_id?, agent_version?, hostname?, meta? }
 */
const submitAgentHeartbeat = asyncHandler(async (req, res) => {
  if (!requireAgentAuth(req, res)) return;
  const companyIdRaw = req.body?.company_id;
  const companyId = Number.isFinite(Number(companyIdRaw)) && Number(companyIdRaw) > 0 ? Number(companyIdRaw) : null;
  await agentHeartbeatSvc.touch(req.agentId, {
    company_id: companyId,
    agent_version: req.body?.agent_version,
    hostname: req.body?.hostname,
    meta: req.body?.meta,
  });
  sendSuccess(res, { agent_id: req.agentId, at: new Date().toISOString() }, 'heartbeat ok');
});

/**
 * GET /api/job-status/:id
 */
const getStatus = asyncHandler(async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return sendError(res, 'Job id is required', 422, 'VALIDATION_ERROR');

  const job = await jobs.getJob(id);
  if (!job) return sendError(res, 'Job not found', 404, 'NOT_FOUND');

  sendSuccess(res, {
    job_id: job.id,
    status: job.status,
    agent_id: job.agent_id,
    action: job.action,
    result: job.result,
    error: job.error,
    created_at: job.created_at,
    started_at: job.started_at,
    completed_at: job.completed_at,
  });
});

module.exports = {
  createProbeJob,
  createDeviceAgentJob,
  enqueueAgentJob,
  pollJobs,
  submitResult,
  submitAgentHeartbeat,
  getStatus,
};
