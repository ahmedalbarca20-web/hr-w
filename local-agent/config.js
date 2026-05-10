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

module.exports = { loadAgentConfig, DEFAULT_WIN_CONFIG_DIR };
