'use strict';

const { AgentHeartbeat } = require('../models/agent_heartbeat.model');
const Company = require('../models/company.model');

/**
 * @param {string} agentId
 * @param {{ company_id?: number|null, agent_version?: string|null, hostname?: string|null, meta?: object|null }} data
 */
async function touch(agentId, data = {}) {
  const id = String(agentId || '').trim();
  if (!id) return null;
  let companyId = null;
  if (data.company_id != null && Number.isFinite(Number(data.company_id)) && Number(data.company_id) > 0) {
    const cid = Number(data.company_id);
    const co = await Company.findByPk(cid, { attributes: ['id'] });
    if (co) companyId = cid;
  }
  const row = {
    agent_id: id,
    company_id: companyId,
    last_seen_at: new Date(),
    agent_version: data.agent_version != null ? String(data.agent_version).slice(0, 64) : null,
    hostname: data.hostname != null ? String(data.hostname).slice(0, 128) : null,
    meta: data.meta && typeof data.meta === 'object' ? data.meta : null,
  };
  await AgentHeartbeat.upsert(row);
  return row;
}

async function getByAgentId(agentId) {
  const id = String(agentId || '').trim();
  if (!id) return null;
  return AgentHeartbeat.findByPk(id, { raw: true });
}

module.exports = { touch, getByAgentId };
