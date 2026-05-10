'use strict';

const crypto = require('crypto');
const { Op } = require('sequelize');
const { AgentActivationCode } = require('../models/agent_activation_code.model');

function normalizeCode(raw) {
  return String(raw || '').trim().toUpperCase().replace(/\s+/g, '-');
}

/**
 * @param {string} code
 * @returns {Promise<object|null>}
 */
async function redeemActivationCode(code) {
  const c = normalizeCode(code);
  if (c.length < 6) return null;
  const row = await AgentActivationCode.findOne({ where: { code: c } });
  if (!row) return null;
  if (row.revoked_at) return null;
  if (row.expires_at && new Date(row.expires_at) < new Date()) return null;

  const backendUrl = String(process.env.AGENT_ACTIVATE_PUBLIC_API_URL || '').trim().replace(/\/+$/, '');
  const globalToken = String(process.env.AGENT_SHARED_TOKEN || process.env.AGENT_TOKEN || '').trim();
  const token = (row.agent_token && String(row.agent_token).trim()) || globalToken;
  if (!backendUrl) {
    throw Object.assign(new Error('AGENT_ACTIVATE_PUBLIC_API_URL is not set on the server'), {
      statusCode: 500,
      code: 'ACTIVATE_CONFIG_ERROR',
    });
  }
  if (!token) {
    throw Object.assign(new Error('AGENT_SHARED_TOKEN (or per-code agent_token) is not configured'), {
      statusCode: 500,
      code: 'ACTIVATE_CONFIG_ERROR',
    });
  }

  const allowedList = String(process.env.ALLOWED_AGENT_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowedList.length > 0 && !allowedList.includes(String(row.agent_id || '').trim())) {
    throw Object.assign(new Error('agent_id on this code is not in ALLOWED_AGENT_IDS'), {
      statusCode: 500,
      code: 'ACTIVATE_CONFIG_ERROR',
    });
  }

  await row.update({ last_used_at: new Date() });

  return {
    backend_url: backendUrl,
    agent_id: String(row.agent_id || '').trim(),
    company_id: Number(row.company_id),
    token,
    poll_interval_ms: Number.isFinite(Number(row.poll_interval_ms)) ? Number(row.poll_interval_ms) : 3000,
    heartbeat_interval_ms: 60000,
  };
}

/** Admin / script helper — create a random-looking code. */
function generateCode(prefix = 'OFFICE') {
  const part = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${part}`;
}

module.exports = {
  normalizeCode,
  redeemActivationCode,
  generateCode,
};
