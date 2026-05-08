'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/response');
const jobs = require('../services/agentJob.service');

const VALID_ACTIONS = new Set(['probe']);

function getAgentBearerToken(req) {
  const raw = String(req.headers.authorization || '');
  if (!raw.startsWith('Bearer ')) return '';
  return raw.slice(7).trim();
}

function requireAgentAuth(req, res) {
  const token = getAgentBearerToken(req);
  const expected = String(process.env.AGENT_SHARED_TOKEN || process.env.AGENT_TOKEN || '').trim();
  if (!expected) {
    sendError(res, 'AGENT_SHARED_TOKEN is not configured on the server', 500, 'AGENT_CONFIG_ERROR');
    return false;
  }
  if (!token || token !== expected) {
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
 * POST /api/probe-device
 * Body: { agent_id, device_ip, timeout_ms? }
 *
 * Creates a job in the queue and returns its status.
 * Auth is handled by global JWT middleware & feature guards in routes/index.js.
 */
const createProbeJob = asyncHandler(async (req, res) => {
  const agentId = String(req.body?.agent_id || '').trim();
  const deviceIp = String(req.body?.device_ip || '').trim();
  const timeoutMs = Number.isFinite(Number(req.body?.timeout_ms)) ? Number(req.body.timeout_ms) : 800;

  if (!agentId) return sendError(res, 'agent_id is required', 422, 'VALIDATION_ERROR');
  if (!deviceIp) return sendError(res, 'device_ip is required', 422, 'VALIDATION_ERROR');

  const job = jobs.createJob({
    agent_id: agentId,
    action: 'probe',
    timeout_ms: timeoutMs,
    payload: { device_ip: deviceIp },
  });

  sendSuccess(res, {
    job_id: job.id,
    status: job.status,
    agent_id: job.agent_id,
  }, 'تم إنشاء مهمة فحص الجهاز. يمكنك متابعة الحالة عبر /api/job-status/:id');
});

/**
 * GET /api/agent/jobs?agent_id=office_1
 * Agent pulls pending jobs (requires Bearer AGENT_SHARED_TOKEN).
 */
const pollJobs = asyncHandler(async (req, res) => {
  if (!requireAgentAuth(req, res)) return;

  const limit = Number.isFinite(Number(req.query.limit)) ? Number(req.query.limit) : 3;
  const list = jobs.claimPendingJobs(req.agentId, { limit });

  const out = list
    .filter((j) => VALID_ACTIONS.has(j.action))
    .map((j) => ({
      job_id: j.id,
      action: j.action,
      device_ip: j.payload?.device_ip || null,
      timeout_ms: j.timeout_ms,
    }));

  return res.json({ success: true, jobs: out });
});

/**
 * POST /api/agent/job-result
 * Body: { agent_id, job_id, status, result, error }
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

  const job = jobs.getJob(jobId);
  if (!job) return sendError(res, 'Job not found', 404, 'NOT_FOUND');
  if (job.agent_id !== req.agentId) {
    return sendError(res, 'Job does not belong to this agent', 403, 'AGENT_FORBIDDEN');
  }

  const updated = jobs.completeJob(jobId, {
    status: statusRaw || undefined,
    result: req.body?.result || null,
    error: req.body?.error || null,
  });

  sendSuccess(res, {
    job_id: updated.id,
    status: updated.status,
  });
});

/**
 * GET /api/job-status/:id
 */
const getStatus = asyncHandler(async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return sendError(res, 'Job id is required', 422, 'VALIDATION_ERROR');

  const job = jobs.getJob(id);
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
  pollJobs,
  submitResult,
  getStatus,
};

