'use strict';

const axios = require('axios');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const localAgentUrl = String(process.env.LOCAL_AGENT_URL || '').trim();
  const agentToken = String(process.env.AGENT_TOKEN || process.env.LOCAL_AGENT_TOKEN || '').trim();
  const deviceIp = String(req.body?.device_ip || '192.168.0.201').trim();
  const timeoutMs = Number.isFinite(Number(req.body?.timeout_ms)) ? Number(req.body.timeout_ms) : 800;

  if (!localAgentUrl) {
    return res.status(500).json({ success: false, error: 'LOCAL_AGENT_URL is missing' });
  }
  if (!agentToken) {
    return res.status(500).json({ success: false, error: 'AGENT_TOKEN is missing' });
  }
  if (!deviceIp) {
    return res.status(422).json({ success: false, error: 'device_ip is required' });
  }

  try {
    const response = await axios.post(
      `${localAgentUrl.replace(/\/+$/, '')}/execute`,
      { action: 'probe', device_ip: deviceIp, timeout_ms: timeoutMs },
      {
        timeout: 2000,
        headers: { Authorization: `Bearer ${agentToken}` },
      }
    );
    return res.status(200).json(response.data);
  } catch (error) {
    const message = error?.response?.data?.error || error?.message || 'Agent request failed';
    return res.status(500).json({ success: false, error: message });
  }
};
