'use strict';

/**
 * Load optional JSON config (installer writes e.g. C:\ProgramData\AttendanceAgent\config.json).
 * Environment variables override file values when set.
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_WIN_CONFIG_DIR = path.join(process.env.ProgramData || 'C:\\ProgramData', 'AttendanceAgent');

function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, 'utf8');
    const o = JSON.parse(raw);
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

/**
 * @param {{ configPath?: string, configDir?: string }} [opts]
 */
function loadAgentConfig(opts = {}) {
  const dir = String(opts.configDir || process.env.AGENT_CONFIG_DIR || DEFAULT_WIN_CONFIG_DIR).trim();
  const file = String(opts.configPath || process.env.AGENT_CONFIG_FILE || path.join(dir, 'config.json')).trim();
  const fileCfg = readJsonFile(file);

  const pick = (envKey, fileKeys, def = '') => {
    const e = String(process.env[envKey] || '').trim();
    if (e) return e;
    for (const k of fileKeys) {
      const v = fileCfg[k];
      if (v != null && String(v).trim() !== '') return String(v).trim();
    }
    return def;
  };

  return {
    configDir: dir,
    configFile: file,
    CLOUD_API_BASE_URL: pick('CLOUD_API_BASE_URL', ['backend_url', 'cloud_api_base_url', 'api_base_url'], ''),
    AGENT_ID: pick('AGENT_ID', ['agent_id'], ''),
    AGENT_SHARED_TOKEN: pick('AGENT_SHARED_TOKEN', ['token', 'shared_token'], ''),
    COMPANY_ID: pick('COMPANY_ID', ['company_id'], ''),
    LOCAL_AGENT_PORT: Number(process.env.LOCAL_AGENT_PORT || fileCfg.local_agent_port || 8099),
    /** Optional; localhost /execute auth when polling-agent calls itself. */
    LOCAL_AGENT_TOKEN: pick('LOCAL_AGENT_TOKEN', ['local_agent_token'], ''),
    POLL_INTERVAL_MS: Number.isFinite(Number(process.env.POLL_INTERVAL_MS))
      ? Number(process.env.POLL_INTERVAL_MS)
      : (Number.isFinite(Number(fileCfg.poll_interval_ms)) ? Number(fileCfg.poll_interval_ms) : 3000),
    HEARTBEAT_INTERVAL_MS: Number.isFinite(Number(process.env.HEARTBEAT_INTERVAL_MS))
      ? Number(process.env.HEARTBEAT_INTERVAL_MS)
      : (Number.isFinite(Number(fileCfg.heartbeat_interval_ms)) ? Number(fileCfg.heartbeat_interval_ms) : 60000),
  };
}

/**
 * @param {string} dir
 * @param {{ backend_url: string, agent_id: string, token: string, company_id?: number|null, poll_interval_ms?: number, heartbeat_interval_ms?: number }} data
 */
function writeAgentConfigFile(dir, data) {
  const d = String(dir || DEFAULT_WIN_CONFIG_DIR).trim();
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  const out = {
    backend_url: String(data.backend_url || '').trim().replace(/\/+$/, ''),
    agent_id: String(data.agent_id || '').trim(),
    token: String(data.token || '').trim(),
    company_id: data.company_id != null && Number.isFinite(Number(data.company_id)) ? Number(data.company_id) : null,
    poll_interval_ms: Number.isFinite(Number(data.poll_interval_ms)) ? Number(data.poll_interval_ms) : 3000,
    heartbeat_interval_ms: Number.isFinite(Number(data.heartbeat_interval_ms))
      ? Number(data.heartbeat_interval_ms)
      : 60000,
  };
  fs.writeFileSync(path.join(d, 'config.json'), JSON.stringify(out, null, 2), 'utf8');
}

module.exports = { loadAgentConfig, writeAgentConfigFile, DEFAULT_WIN_CONFIG_DIR };
