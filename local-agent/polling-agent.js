'use strict';

const path = require('path');
const { parseArgs: parseActivateArgs } = require('./activate-cli');

if (parseActivateArgs(process.argv).activate) {
  require('./activate-cli')
    .run(process.argv)
    .then(() => process.exit(process.exitCode || 0))
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error(e);
      process.exit(1);
    });
} else {
const fs = require('fs');
const os = require('os');
// Always load local-agent/.env (cwd may be repo root).
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { loadAgentConfig, DEFAULT_WIN_CONFIG_DIR } = require('./config');
const axios = require('axios');
const { agentLog } = require('./logger');
const { app, log, runProbe, DEFAULT_TIMEOUT_MS } = require('./server');

const CFG = loadAgentConfig();
const PORT = Number(CFG.LOCAL_AGENT_PORT || 8099);
const API_BASE_URL = String(CFG.CLOUD_API_BASE_URL || '').replace(/\/+$/, '');
const AGENT_ID = String(CFG.AGENT_ID || '').trim();
const AGENT_SHARED_TOKEN = String(CFG.AGENT_SHARED_TOKEN || '').trim();
const COMPANY_ID_RAW = String(CFG.COMPANY_ID || '').trim();
const COMPANY_ID = Number.isFinite(Number(COMPANY_ID_RAW)) && Number(COMPANY_ID_RAW) > 0 ? Number(COMPANY_ID_RAW) : null;
const POLL_INTERVAL_MS = Number.isFinite(Number(CFG.POLL_INTERVAL_MS)) ? Number(CFG.POLL_INTERVAL_MS) : 3000;
const HEARTBEAT_INTERVAL_MS = Number.isFinite(Number(CFG.HEARTBEAT_INTERVAL_MS)) ? Number(CFG.HEARTBEAT_INTERVAL_MS) : 60000;
const PENDING_RESULTS_FILE = path.join(CFG.configDir || DEFAULT_WIN_CONFIG_DIR, 'pending-job-results.json');

const pkg = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  } catch {
    return { version: '1.0.0' };
  }
})();

if (!API_BASE_URL) {
  throw new Error('CLOUD_API_BASE_URL (or config.json backend_url) is required');
}
if (!AGENT_ID) {
  throw new Error('AGENT_ID (or config.json agent_id) is required');
}
if (!AGENT_SHARED_TOKEN) {
  throw new Error('AGENT_SHARED_TOKEN is required to authenticate against cloud API');
}

app.listen(PORT, '0.0.0.0', () => {
  log('agent_http_started', { port: PORT });
  agentLog('INFO', 'Agent HTTP started', { port: PORT });
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function classifyAxiosError(err) {
  const code = err?.code || err?.cause?.code || null;
  const msg = String(err?.message || err || '');
  if (code === 'ECONNREFUSED') return { kind: 'ECONNREFUSED', code, msg };
  if (code === 'ETIMEDOUT' || code === 'ECONNABORTED') return { kind: 'TIMEOUT', code, msg };
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return { kind: 'DNS', code, msg };
  return { kind: 'OTHER', code, msg };
}

let pollBackoffMs = 0;

function loadPendingResults() {
  try {
    if (!fs.existsSync(PENDING_RESULTS_FILE)) return [];
    const raw = fs.readFileSync(PENDING_RESULTS_FILE, 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function savePendingResults(rows) {
  try {
    const dir = path.dirname(PENDING_RESULTS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(PENDING_RESULTS_FILE, JSON.stringify(rows, null, 2), 'utf8');
  } catch (e) {
    log('pending_results_write_error', { message: String(e?.message || e) });
  }
}

async function flushPendingResultsOnce() {
  let rows = loadPendingResults();
  if (rows.length === 0) return;
  const next = [];
  for (const row of rows) {
    try {
      const resp = await axios.post(`${API_BASE_URL}/agent/job-result`, row.body, {
        timeout: 120000,
        headers: {
          Authorization: `Bearer ${AGENT_SHARED_TOKEN}`,
          'Content-Type': 'application/json',
        },
        validateStatus: () => true,
      });
      if (resp.status >= 200 && resp.status < 300) {
        log('pending_result_flushed', { job_id: row.body?.job_id });
      } else {
        next.push(row);
      }
    } catch {
      next.push(row);
    }
  }
  if (next.length !== rows.length) savePendingResults(next);
}

async function fetchJobsOnce() {
  try {
    const url = `${API_BASE_URL}/agent/jobs?agent_id=${encodeURIComponent(AGENT_ID)}`;
    const resp = await axios.get(url, {
      timeout: Math.max(2000, POLL_INTERVAL_MS + 5000),
      headers: {
        Authorization: `Bearer ${AGENT_SHARED_TOKEN}`,
      },
      validateStatus: () => true,
    });

    pollBackoffMs = 0;

    if (resp.status === 204) return [];
    if (resp.status !== 200) {
      log('poll_http_error', { status: resp.status, data: resp.data });
      return [];
    }

    const jobs = Array.isArray(resp.data?.jobs) ? resp.data.jobs : [];
    if (jobs.length > 0) {
      log('poll_jobs_found', { count: jobs.length });
      agentLog('INFO', 'Polling jobs', { count: jobs.length });
    }
    return jobs;
  } catch (err) {
    const c = classifyAxiosError(err);
    log('poll_error', { kind: c.kind, code: c.code, message: c.msg });
    pollBackoffMs = Math.min(60000, pollBackoffMs ? Math.min(60000, pollBackoffMs * 2) : 3000);
    return [];
  }
}

async function sendResult(job, status, result, error) {
  const body = {
    agent_id: AGENT_ID,
    job_id: job.job_id,
    status,
    result: result || null,
    error: error || null,
  };

  const postTimeout = job.action === 'pull_attendance' ? 120000 : 30000;

  for (let i = 0; i < 2; i += 1) {
    try {
      const url = `${API_BASE_URL}/agent/job-result`;
      const resp = await axios.post(url, body, {
        timeout: postTimeout,
        headers: {
          Authorization: `Bearer ${AGENT_SHARED_TOKEN}`,
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
      if (resp.status >= 200 && resp.status < 300) {
        log('job_result_sent', { job_id: job.job_id, status });
        return;
      }
      log('job_result_http_error', { job_id: job.job_id, statusCode: resp.status });
    } catch (err) {
      log('job_result_error', { job_id: job.job_id, message: String(err?.message || err) });
      const isTimeout = err?.code === 'ECONNABORTED' || /timeout/i.test(String(err?.message || ''));
      if (!isTimeout || i === 1) {
        const pending = loadPendingResults();
        pending.push({ at: new Date().toISOString(), body });
        savePendingResults(pending);
        log('job_result_queued_offline', { job_id: job.job_id });
        agentLog('WARN', 'Offline retry queued', { job_id: job.job_id });
        return;
      }
    }
  }
}

async function sendHeartbeatOnce() {
  try {
    const payload = {
      agent_id: AGENT_ID,
      agent_version: pkg.version || '1.0.0',
      hostname: os.hostname(),
    };
    if (COMPANY_ID) payload.company_id = COMPANY_ID;
    const resp = await axios.post(`${API_BASE_URL}/agent/heartbeat`, payload, {
      timeout: 15000,
      headers: {
        Authorization: `Bearer ${AGENT_SHARED_TOKEN}`,
        'Content-Type': 'application/json',
      },
      validateStatus: () => true,
    });
    if (resp.status >= 200 && resp.status < 300) {
      log('heartbeat_ok', {});
    } else {
      log('heartbeat_http_error', { status: resp.status });
    }
  } catch (err) {
    log('heartbeat_error', { message: String(err?.message || err), code: err?.code || null });
  }
}

function jobToExecuteBody(job) {
  const skip = new Set(['job_id', 'device_id', 'company_id', 'auto_ingest', 'ingest_options']);
  const execBody = {};
  for (const [k, v] of Object.entries(job)) {
    if (skip.has(k)) continue;
    if (v !== undefined && v !== null) execBody[k] = v;
  }
  const action = String(job.action || '').trim().toLowerCase();
  if (!execBody.action) execBody.action = action;
  if (!execBody.device_ip && job.device_ip) execBody.device_ip = String(job.device_ip).trim();
  if (!execBody.ip_address && execBody.device_ip) execBody.ip_address = execBody.device_ip;
  if (
    !execBody.socket_timeout_ms
    && Number.isFinite(Number(job.timeout_ms))
    && ['pull_attendance', 'list_users', 'zk_probe_snapshot', 'unlock_device', 'set_user_privilege'].includes(action)
  ) {
    execBody.socket_timeout_ms = Number(job.timeout_ms);
  }
  return execBody;
}

async function runExecuteViaLocalHttp(job) {
  const token = String(process.env.LOCAL_AGENT_TOKEN || CFG.LOCAL_AGENT_TOKEN || '').trim();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const execBody = jobToExecuteBody(job);
  const action = String(execBody.action || '').trim().toLowerCase();
  const budget = action === 'pull_attendance' ? 200000 : action === 'zk_probe_snapshot' ? 130000 : 90000;
  const resp = await axios.post(`http://127.0.0.1:${PORT}/execute`, execBody, {
    headers,
    timeout: budget,
    validateStatus: () => true,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });
  const json = resp.data && typeof resp.data === 'object' ? resp.data : { ok: false, error: 'Invalid JSON from /execute' };
  const ok = json.ok === true;
  const status = ok ? 'success' : (resp.status === 408 || /timeout/i.test(String(json.message || json.error || '')) ? 'timeout' : 'failed');
  return { status, json };
}

async function handleJob(job) {
  const action = String(job.action || '').trim().toLowerCase();
  agentLog('INFO', `Executing ${action}`, { job_id: job.job_id });
  if (action === 'probe') {
    const ip = String(job.device_ip || '').trim();
    if (!ip) {
      await sendResult(job, 'failed', null, { message: 'device_ip is missing in job' });
      return;
    }
    const port = Number.isFinite(Number(job.port)) && Number(job.port) > 0 ? Number(job.port) : 80;
    const timeoutMs = Number.isFinite(Number(job.timeout_ms)) ? Number(job.timeout_ms) : DEFAULT_TIMEOUT_MS;
    const out = await runProbe({ ip, port, timeoutMsRaw: timeoutMs });
    const status = out.ok ? 'success' : (out.code === 'ECONNABORTED' ? 'timeout' : 'failed');
    await sendResult(job, status, out, null);
    return;
  }

  if (
    action === 'pull_attendance'
    || action === 'zk_probe_snapshot'
    || action === 'list_users'
    || action === 'unlock_device'
    || action === 'set_user_privilege'
  ) {
    try {
      const { status, json } = await runExecuteViaLocalHttp(job);
      await sendResult(job, status, json, null);
    } catch (err) {
      const isTimeout = err?.code === 'ECONNABORTED' || /timeout/i.test(String(err?.message || err));
      await sendResult(job, isTimeout ? 'timeout' : 'failed', null, { message: String(err?.message || err) });
    }
    return;
  }

  await sendResult(job, 'failed', null, { message: `Unknown action: ${job.action}` });
}

function startAutoEnqueueIfConfigured() {
  const intervalMs = Number(process.env.AGENT_AUTO_PULL_INTERVAL_MS || 0);
  const raw = String(process.env.AGENT_AUTO_PULL_DEVICES_JSON || '').trim();
  if (!intervalMs || intervalMs < 60000 || !raw) return;
  let rows;
  try {
    rows = JSON.parse(raw);
  } catch {
    log('auto_pull_devices_json_invalid', {});
    return;
  }
  if (!Array.isArray(rows) || rows.length === 0) return;

  const tick = async () => {
    for (const r of rows) {
      const companyId = Number(r.company_id);
      const deviceId = Number(r.device_id);
      if (!Number.isFinite(companyId) || !Number.isFinite(deviceId)) continue;
      try {
        await axios.post(
          `${API_BASE_URL}/agent/enqueue-job`,
          {
            agent_id: AGENT_ID,
            action: 'pull_attendance',
            company_id: companyId,
            device_id: deviceId,
            auto_ingest: r.auto_ingest !== false,
            socket_timeout_ms: Number.isFinite(Number(r.socket_timeout_ms)) ? Number(r.socket_timeout_ms) : undefined,
          },
          {
            headers: {
              Authorization: `Bearer ${AGENT_SHARED_TOKEN}`,
              'Content-Type': 'application/json',
            },
            timeout: 20000,
            validateStatus: () => true,
          },
        );
      } catch (err) {
        log('auto_enqueue_pull_error', { message: String(err?.message || err) });
      }
    }
  };

  setInterval(() => {
    tick().catch((err) => log('auto_enqueue_tick_fatal', { message: String(err?.message || err) }));
  }, intervalMs);
  log('auto_enqueue_started', { interval_ms: intervalMs, devices: rows.length });
}

async function loop() {
  log('poller_started', {
    agent_id: AGENT_ID,
    api: API_BASE_URL,
    interval_ms: POLL_INTERVAL_MS,
    heartbeat_ms: HEARTBEAT_INTERVAL_MS,
  });
  let lastHb = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await flushPendingResultsOnce();

    const now = Date.now();
    if (now - lastHb >= HEARTBEAT_INTERVAL_MS) {
      lastHb = now;
      // eslint-disable-next-line no-await-in-loop
      await sendHeartbeatOnce();
    }

    const jobs = await fetchJobsOnce();
    // eslint-disable-next-line no-await-in-loop
    for (const job of jobs) {
      // eslint-disable-next-line no-await-in-loop
      await handleJob(job);
    }
    const extra = pollBackoffMs > 0 ? pollBackoffMs : 0;
    // eslint-disable-next-line no-await-in-loop
    await sleep(POLL_INTERVAL_MS + extra);
  }
}

startAutoEnqueueIfConfigured();

loop().catch((err) => {
  log('poller_fatal', { message: String(err?.message || err), stack: err?.stack });
  agentLog('ERROR', 'Poller fatal', { message: String(err?.message || err) });
  process.exitCode = 1;
});
}
