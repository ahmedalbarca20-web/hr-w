'use strict';

/**
 * CLI: AttendanceAgent.exe --activate CODE --api-base https://host/api
 * Writes %ProgramData%\AttendanceAgent\config.json (no .env needed).
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { writeAgentConfigFile, DEFAULT_WIN_CONFIG_DIR } = require('./config');

function parseArgs(argv) {
  const a = argv.slice(2);
  let activate;
  let apiBase;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === '--activate' && a[i + 1]) {
      activate = a[i + 1];
      i += 1;
      continue;
    }
    if ((a[i] === '--api-base' || a[i] === '--api') && a[i + 1]) {
      apiBase = a[i + 1];
      i += 1;
    }
  }
  return { activate, apiBase };
}

async function run(argv) {
  const { activate, apiBase } = parseArgs(argv);
  if (!activate) return false;

  const base = String(apiBase || '').trim().replace(/\/+$/, '');
  if (!base) {
    // eslint-disable-next-line no-console
    console.error('Missing --api-base https://your-api.example.com/api');
    process.exitCode = 2;
    return true;
  }

  const url = `${base}/agent/activate`;
  let resp;
  try {
    resp = await axios.post(
      url,
      { activation_code: activate },
      { timeout: 30000, validateStatus: () => true },
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Activation request failed:', e.message || e);
    process.exitCode = 1;
    return true;
  }

  if (resp.status < 200 || resp.status >= 300 || !resp.data?.success) {
    // eslint-disable-next-line no-console
    console.error('Activation failed:', resp.status, resp.data?.error || resp.data);
    process.exitCode = 1;
    return true;
  }

  const d = resp.data?.data || {};
  const cfg = {
    backend_url: d.backend_url,
    agent_id: d.agent_id,
    token: d.token,
    company_id: d.company_id,
    poll_interval_ms: d.poll_interval_ms || 3000,
    heartbeat_interval_ms: d.heartbeat_interval_ms || 60000,
  };
  if (!cfg.backend_url || !cfg.agent_id || !cfg.token) {
    // eslint-disable-next-line no-console
    console.error('Invalid activation response (missing fields).');
    process.exitCode = 1;
    return true;
  }

  const dir = process.env.AGENT_CONFIG_DIR || DEFAULT_WIN_CONFIG_DIR;
  writeAgentConfigFile(dir, cfg);
  // eslint-disable-next-line no-console
  console.log('Saved config to', path.join(dir, 'config.json'));
  return true;
}

module.exports = { run, parseArgs };
