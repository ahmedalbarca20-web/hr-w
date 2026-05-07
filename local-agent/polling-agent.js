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

  for (let i = 0; i < 2; i += 1) {
    try {
      const url = `${API_BASE_URL}/agent/job-result`;
      const resp = await axios.post(url, body, {
        timeout: 3000,
        headers: {
          Authorization: `Bearer ${AGENT_SHARED_TOKEN}`,
        },
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

async function handleJob(job) {
  if (job.action === 'probe') {
    const ip = String(job.device_ip || '').trim();
    if (!ip) {
      await sendResult(job, 'failed', null, { message: 'device_ip is missing in job' });
      return;
    }
    const timeoutMs = Number.isFinite(Number(job.timeout_ms)) ? Number(job.timeout_ms) : DEFAULT_TIMEOUT_MS;
    const out = await runProbe({ ip, port: 80, timeoutMsRaw: timeoutMs });
    const status = out.ok ? 'success' : (out.code === 'ECONNABORTED' ? 'timeout' : 'failed');
    await sendResult(job, status, out, null);
    return;
  }

  await sendResult(job, 'failed', null, { message: `Unknown action: ${job.action}` });
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

loop().catch((err) => {
  log('poller_fatal', { message: String(err?.message || err), stack: err?.stack });
  process.exitCode = 1;
});

