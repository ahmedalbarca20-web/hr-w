'use strict';

require('dotenv').config();

const axios = require('axios');
const { app, log, runProbe, DEFAULT_TIMEOUT_MS } = require('./server');

const PORT = Number(process.env.LOCAL_AGENT_PORT || 8099);
const API_BASE_URL = String(process.env.CLOUD_API_BASE_URL || '').replace(/\/+$/, '');
const AGENT_ID = String(process.env.AGENT_ID || '').trim();
const AGENT_SHARED_TOKEN = String(process.env.AGENT_SHARED_TOKEN || '').trim();
const POLL_INTERVAL_MS = Number.isFinite(Number(process.env.POLL_INTERVAL_MS))
  ? Number(process.env.POLL_INTERVAL_MS)
  : 2000;

if (!API_BASE_URL) {
  throw new Error('CLOUD_API_BASE_URL is required (e.g. https://your-app.vercel.app/api)');
}
if (!AGENT_ID) {
  throw new Error('AGENT_ID is required (e.g. office_1)');
}
if (!AGENT_SHARED_TOKEN) {
  throw new Error('AGENT_SHARED_TOKEN is required to authenticate against cloud API');
}

app.listen(PORT, '0.0.0.0', () => {
  log('agent_http_started', { port: PORT });
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJobsOnce() {
  try {
    const url = `${API_BASE_URL}/agent/jobs?agent_id=${encodeURIComponent(AGENT_ID)}`;
    const resp = await axios.get(url, {
      timeout: Math.max(1000, POLL_INTERVAL_MS - 200),
      headers: {
        Authorization: `Bearer ${AGENT_SHARED_TOKEN}`,
      },
      validateStatus: () => true,
    });

    if (resp.status === 204) return [];
    if (resp.status !== 200) {
      log('poll_http_error', { status: resp.status, data: resp.data });
      return [];
    }

    const jobs = Array.isArray(resp.data?.jobs) ? resp.data.jobs : [];
    if (jobs.length > 0) {
      log('poll_jobs_found', { count: jobs.length });
    }
    return jobs;
  } catch (err) {
    log('poll_error', { message: String(err?.message || err), code: err?.code || null });
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
      if (!isTimeout || i === 1) return;
    }
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
  const token = String(process.env.LOCAL_AGENT_TOKEN || '').trim();
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
  log('poller_started', { agent_id: AGENT_ID, api: API_BASE_URL, interval_ms: POLL_INTERVAL_MS });
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const jobs = await fetchJobsOnce();
    // Process sequentially to keep things simple for now.
    // Can be parallelised per-job in the future.
    // eslint-disable-next-line no-await-in-loop
    for (const job of jobs) {
      // eslint-disable-next-line no-await-in-loop
      await handleJob(job);
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(POLL_INTERVAL_MS);
  }
}

startAutoEnqueueIfConfigured();

loop().catch((err) => {
  log('poller_fatal', { message: String(err?.message || err), stack: err?.stack });
  process.exitCode = 1;
});

