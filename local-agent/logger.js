'use strict';

const fs = require('fs');
const path = require('path');

const MAX_BYTES = Number(process.env.AGENT_LOG_MAX_BYTES || 5 * 1024 * 1024);
const DEFAULT_LOG_DIR = path.join(process.env.ProgramData || 'C:\\ProgramData', 'AttendanceAgent', 'logs');

function logDir() {
  return String(process.env.AGENT_LOG_DIR || DEFAULT_LOG_DIR).trim();
}

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function rotateIfNeeded(filePath) {
  try {
    const st = fs.statSync(filePath);
    if (st.size < MAX_BYTES) return;
    const rot = `${filePath}.1`;
    if (fs.existsSync(rot)) fs.unlinkSync(rot);
    fs.renameSync(filePath, rot);
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} level
 * @param {string} message
 * @param {object} [meta]
 */
function agentLog(level, message, meta = {}) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] ${message}${Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''}\n`;
  const consoleOn = ['1', 'true', 'yes'].includes(String(process.env.AGENT_LOG_CONSOLE || '').trim().toLowerCase());
  if (consoleOn) {
    // eslint-disable-next-line no-console
    console.error(line.trimEnd());
  }
  try {
    const dir = logDir();
    ensureDir(dir);
    const filePath = path.join(dir, 'agent.log');
    rotateIfNeeded(filePath);
    fs.appendFileSync(filePath, line, 'utf8');
  } catch {
    /* ignore disk errors */
  }
}

module.exports = { agentLog, logDir };
