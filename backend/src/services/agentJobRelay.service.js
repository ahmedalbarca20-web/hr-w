'use strict';

/**
 * Outbound polling agent relay: enqueue jobs in DB and wait for the office agent to execute + POST /agent/job-result.
 * Replaces direct LOCAL_AGENT_URL fetch when DISABLE_LOCAL_AGENT_URL=1 or LOCAL_AGENT_URL is unset and AGENT_RELAY_DEFAULT_ID is set.
 */

const jobs = require('./agentJob.service');
const { Device } = require('../models/device.model');

const POLLABLE = new Set([
  'probe',
  'pull_attendance',
  'zk_probe_snapshot',
  'list_users',
  'unlock_device',
  'set_user_privilege',
]);

function ensureAgentAllowed(agentId) {
  const id = String(agentId || '').trim();
  if (!id) {
    throw Object.assign(new Error('agent_id is required'), { statusCode: 422, code: 'VALIDATION_ERROR' });
  }
  const allowedList = String(process.env.ALLOWED_AGENT_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowedList.length > 0 && !allowedList.includes(id)) {
    throw Object.assign(new Error('agent_id is not in ALLOWED_AGENT_IDS on this server'), {
      statusCode: 403,
      code: 'AGENT_FORBIDDEN',
    });
  }
  return id;
}

async function resolveDeviceForCompany(companyId, body) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid < 1) {
    throw Object.assign(new Error('company_id is required'), { statusCode: 422, code: 'VALIDATION_ERROR' });
  }
  const deviceId = Number(body.device_id);
  if (Number.isFinite(deviceId) && deviceId > 0) {
    const dev = await Device.findOne({ where: { id: deviceId, company_id: cid } });
    if (!dev) {
      throw Object.assign(new Error('Device not found'), { statusCode: 404, code: 'NOT_FOUND' });
    }
    return dev;
  }
  const ip = String(body.device_ip || body.ip_address || '').trim();
  if (!ip) {
    throw Object.assign(new Error('device_id or device_ip is required'), { statusCode: 422, code: 'VALIDATION_ERROR' });
  }
  const dev = await Device.findOne({ where: { company_id: cid, ip_address: ip } });
  if (!dev) {
    throw Object.assign(
      new Error('No device record matches this IP for your company — save the device first or pass device_id'),
      { statusCode: 404, code: 'NOT_FOUND' },
    );
  }
  return dev;
}

/**
 * Build job row fields from HR relay body (same shape as localAgentRelaySchema output + agent_id optional).
 */
async function buildJobFromRelayBody(companyId, agentId, body) {
  const action = String(body.action || '').trim().toLowerCase();
  if (!POLLABLE.has(action)) {
    throw Object.assign(new Error(`Unsupported action: ${action}`), { statusCode: 422, code: 'VALIDATION_ERROR' });
  }

  if (action === 'probe') {
    const deviceIp = String(body.device_ip || body.ip_address || '').trim();
    if (!deviceIp) {
      throw Object.assign(new Error('device_ip is required'), { statusCode: 422, code: 'VALIDATION_ERROR' });
    }
    let timeoutMs = Number.isFinite(Number(body.timeout_ms)) ? Number(body.timeout_ms) : 800;
    timeoutMs = Math.min(5000, Math.max(200, timeoutMs));
    const payload = {
      device_ip: deviceIp,
      port: Number.isFinite(Number(body.port)) && Number(body.port) > 0 ? Number(body.port) : 80,
    };
    return { action, timeout_ms: timeoutMs, payload };
  }

  if (action === 'zk_probe_snapshot') {
    let deviceIp = String(body.device_ip || body.ip_address || '').trim();
    let commKey = body.comm_key != null ? String(body.comm_key) : undefined;
    const did = Number(body.device_id);
    if (Number.isFinite(did) && did > 0) {
      const dev = await Device.findOne({ where: { id: did, company_id: Number(companyId) } });
      if (!dev) {
        throw Object.assign(new Error('Device not found'), { statusCode: 404, code: 'NOT_FOUND' });
      }
      deviceIp = deviceIp || String(dev.ip_address || '').trim();
      commKey = commKey != null ? commKey : (dev.comm_key || undefined);
    } else if (deviceIp) {
      const dev = await Device.findOne({ where: { company_id: Number(companyId), ip_address: deviceIp } });
      if (dev) commKey = commKey != null ? commKey : (dev.comm_key || undefined);
    }
    if (!deviceIp) {
      throw Object.assign(new Error('device_ip or device_id is required'), { statusCode: 422, code: 'VALIDATION_ERROR' });
    }
    const port = Number.isFinite(Number(body.port)) && Number(body.port) > 0 ? Number(body.port) : 4370;
    const socketTimeout = Number.isFinite(Number(body.socket_timeout_ms))
      ? Math.min(120000, Math.max(2000, Number(body.socket_timeout_ms)))
      : 8000;
    const payload = {
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
    return { action, timeout_ms: socketTimeout, payload };
  }

  const dev = await resolveDeviceForCompany(companyId, body);
  const deviceIp = String(body.device_ip || body.ip_address || dev.ip_address || '').trim();
  if (!deviceIp) {
    throw Object.assign(new Error('Device has no ip_address'), { statusCode: 422, code: 'VALIDATION_ERROR' });
  }
  const port = Number.isFinite(Number(body.port)) && Number(body.port) > 0 ? Number(body.port) : 4370;

  if (action === 'pull_attendance') {
    const socketTimeout = Number.isFinite(Number(body.socket_timeout_ms))
      ? Math.min(180000, Math.max(8000, Number(body.socket_timeout_ms)))
      : 120000;
    const payload = {
      device_ip: deviceIp,
      port,
      comm_key: body.comm_key != null ? String(body.comm_key) : (dev.comm_key || undefined),
      socket_timeout_ms: socketTimeout,
      device_id: dev.id,
      company_id: Number(companyId),
      auto_ingest: body.auto_ingest !== false,
      ingest_options: {
        date_from: body.date_from != null ? String(body.date_from) : undefined,
        date_to: body.date_to != null ? String(body.date_to) : undefined,
        auto_process: body.auto_process !== false,
        overwrite_attendance: body.overwrite_attendance !== false,
        max_records: Number.isFinite(Number(body.max_records)) ? Number(body.max_records) : 12000,
      },
    };
    return { action, timeout_ms: socketTimeout, payload };
  }

  if (action === 'list_users') {
    const socketTimeout = Number.isFinite(Number(body.socket_timeout_ms))
      ? Math.min(120000, Math.max(8000, Number(body.socket_timeout_ms)))
      : 45000;
    const payload = {
      device_ip: deviceIp,
      port,
      comm_key: body.comm_key != null ? String(body.comm_key) : (dev.comm_key || undefined),
      socket_timeout_ms: socketTimeout,
      udp_local_port: Number.isFinite(Number(body.udp_local_port)) ? Number(body.udp_local_port) : 5000,
    };
    return { action, timeout_ms: socketTimeout, payload };
  }

  if (action === 'unlock_device') {
    const socketTimeout = Number.isFinite(Number(body.socket_timeout_ms))
      ? Math.min(120000, Math.max(8000, Number(body.socket_timeout_ms)))
      : 50000;
    const payload = {
      device_ip: deviceIp,
      port,
      comm_key: body.comm_key != null ? String(body.comm_key) : (dev.comm_key || undefined),
      socket_timeout_ms: socketTimeout,
    };
    return { action, timeout_ms: socketTimeout, payload };
  }

  if (action === 'set_user_privilege') {
    const uid = Number(body.uid);
    if (!Number.isInteger(uid) || uid < 1) {
      throw Object.assign(new Error('uid is required for set_user_privilege'), { statusCode: 422, code: 'VALIDATION_ERROR' });
    }
    const socketTimeout = Number.isFinite(Number(body.socket_timeout_ms))
      ? Math.min(120000, Math.max(8000, Number(body.socket_timeout_ms)))
      : 45000;
    const payload = {
      device_ip: deviceIp,
      port,
      comm_key: body.comm_key != null ? String(body.comm_key) : (dev.comm_key || undefined),
      socket_timeout_ms: socketTimeout,
      uid,
      is_admin: body.is_admin === true,
    };
    return { action, timeout_ms: socketTimeout, payload };
  }

  throw Object.assign(new Error(`Unsupported action: ${action}`), { statusCode: 422, code: 'VALIDATION_ERROR' });
}

function relayMaxWaitMs(action, timeout_ms) {
  const t = Number(timeout_ms) || 8000;
  if (action === 'pull_attendance') return Math.min(220000, t + 25000);
  if (action === 'zk_probe_snapshot') return Math.min(140000, t + 20000);
  if (action === 'list_users' || action === 'set_user_privilege') return Math.min(90000, t + 20000);
  if (action === 'unlock_device') return Math.min(90000, t + 15000);
  if (action === 'probe') return Math.min(20000, t + 3000);
  return 90000;
}

/**
 * @param {number} companyId
 * @param {string} agentId
 * @param {object} body — localAgentRelaySchema output (+ optional agent_id ignored for auth)
 * @returns {Promise<object>} agent JSON result (same shape as local /execute)
 */
async function enqueueRelayJobAndWait(companyId, agentId, body) {
  const aid = ensureAgentAllowed(agentId);
  const { action, timeout_ms, payload } = await buildJobFromRelayBody(companyId, aid, body);
  const job = await jobs.createJob({
    agent_id: aid,
    action,
    timeout_ms,
    payload,
  });
  const maxWait = relayMaxWaitMs(action, timeout_ms);
  const row = await jobs.waitForJobTerminal(job.id, { maxWaitMs: maxWait, intervalMs: 450 });
  const st = String(row.status || '').toLowerCase();
  if (st !== 'success') {
    const msg = row.error && (row.error.message || row.error) ? String(row.error.message || row.error) : `Agent job ${st}`;
    throw Object.assign(new Error(msg), { statusCode: 502, code: 'AGENT_JOB_FAILED' });
  }
  return row.result && typeof row.result === 'object' ? row.result : {};
}

/**
 * Cloud probe: HTTP panel check on device_ip (no company scope).
 */
async function enqueueProbeJobAndWait(agentId, device_ip, timeout_ms) {
  const aid = ensureAgentAllowed(agentId);
  const isVercel = process.env.VERCEL === '1';
  const t = isVercel
    ? Math.min(1000, Math.max(200, Number(timeout_ms) || 800))
    : Math.min(15000, Math.max(200, Number(timeout_ms) || 4000));
  const job = await jobs.createJob({
    agent_id: aid,
    action: 'probe',
    timeout_ms: Math.min(5000, Math.max(200, t)),
    payload: {
      device_ip: String(device_ip || '').trim(),
      port: 80,
    },
  });
  const maxWait = isVercel ? 2500 : Math.min(20000, t + 2500);
  const row = await jobs.waitForJobTerminal(job.id, { maxWaitMs: maxWait, intervalMs: 350 });
  const st = String(row.status || '').toLowerCase();
  if (st !== 'success') {
    const msg = row.error && (row.error.message || row.error) ? String(row.error.message || row.error) : `Probe ${st}`;
    throw Object.assign(new Error(msg), { statusCode: 502, code: 'AGENT_JOB_FAILED' });
  }
  return row.result && typeof row.result === 'object' ? row.result : {};
}

/**
 * Server-side ZK call mirror (list_users, zk_probe_snapshot, pull_attendance, unlock, set_user_privilege) via queue.
 * @param {number} companyId
 * @param {string} agentIdFromEnv — AGENT_RELAY_DEFAULT_ID
 * @param {string} action
 * @param {number} deviceId
 * @param {object} [overrides] — port, comm_key, socket_timeout_ms, uid, is_admin, ingest options, etc.
 */
async function enqueueDeviceActionAndWait(companyId, agentIdFromEnv, action, deviceId, overrides = {}) {
  const aid = ensureAgentAllowed(agentIdFromEnv);
  const act = String(action || '').trim().toLowerCase();
  const body = { action: act, device_id: deviceId, ...overrides };
  return enqueueRelayJobAndWait(companyId, aid, body);
}

/**
 * zk_probe_snapshot for arbitrary IP (device form before save).
 */
async function enqueueZkProbeSnapshotAndWait(agentId, zkBody) {
  const aid = ensureAgentAllowed(agentId);
  const ip = String(zkBody.ip_address || zkBody.device_ip || '').trim();
  if (!ip) {
    throw Object.assign(new Error('ip_address is required'), { statusCode: 422, code: 'VALIDATION_ERROR' });
  }
  const socketTimeout = Number.isFinite(Number(zkBody.socket_timeout_ms))
    ? Math.min(125000, Math.max(2500, Number(zkBody.socket_timeout_ms)))
    : 55000;
  const job = await jobs.createJob({
    agent_id: aid,
    action: 'zk_probe_snapshot',
    timeout_ms: socketTimeout,
    payload: {
      device_ip: ip,
      port: Number.isFinite(Number(zkBody.port)) && Number(zkBody.port) > 0 ? Number(zkBody.port) : 4370,
      comm_key: zkBody.comm_key,
      socket_timeout_ms: socketTimeout,
      udp_local_port: Number.isFinite(Number(zkBody.udp_local_port)) ? Number(zkBody.udp_local_port) : undefined,
      minimal_probe: zkBody.minimal_probe === true,
      include_users: zkBody.include_users !== false,
      max_users: Number.isFinite(Number(zkBody.max_users)) ? Math.min(2000, Number(zkBody.max_users)) : 80,
      include_attendance_size: zkBody.include_attendance_size === true,
    },
  });
  const row = await jobs.waitForJobTerminal(job.id, { maxWaitMs: relayMaxWaitMs('zk_probe_snapshot', socketTimeout) });
  const st = String(row.status || '').toLowerCase();
  if (st !== 'success') {
    const msg = row.error && (row.error.message || row.error) ? String(row.error.message || row.error) : `ZK probe ${st}`;
    throw Object.assign(new Error(msg), { statusCode: 502, code: 'AGENT_JOB_FAILED' });
  }
  return row.result && typeof row.result === 'object' ? row.result : {};
}

/**
 * list_users for scan range (one IP at a time).
 */
async function enqueueListUsersForIpAndWait(agentId, ip, port, socket_timeout_ms) {
  const aid = ensureAgentAllowed(agentId);
  const sock = Math.min(18000, Math.max(3000, Number(socket_timeout_ms) || 3000));
  const job = await jobs.createJob({
    agent_id: aid,
    action: 'list_users',
    timeout_ms: sock,
    payload: {
      device_ip: String(ip || '').trim(),
      port: Number.isFinite(Number(port)) && Number(port) > 0 ? Number(port) : 4370,
      socket_timeout_ms: sock,
      udp_local_port: 5000,
    },
  });
  const row = await jobs.waitForJobTerminal(job.id, { maxWaitMs: Math.min(25000, sock + 8000), intervalMs: 400 });
  const st = String(row.status || '').toLowerCase();
  if (st !== 'success') {
    return { ok: false, errors: [{ message: String(row.error?.message || row.error || st) }] };
  }
  const r = row.result && typeof row.result === 'object' ? row.result : {};
  return r;
}

module.exports = {
  ensureAgentAllowed,
  enqueueRelayJobAndWait,
  enqueueProbeJobAndWait,
  enqueueDeviceActionAndWait,
  enqueueZkProbeSnapshotAndWait,
  enqueueListUsersForIpAndWait,
  relayMaxWaitMs,
};
