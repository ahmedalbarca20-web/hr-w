'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/response');
const agentActivation = require('../services/agentActivation.service');

/**
 * POST /api/agent/activate
 * Public (installer). Body: { activation_code } or { code }
 */
const activate = asyncHandler(async (req, res) => {
  const raw = req.body?.activation_code ?? req.body?.code;
  const code = agentActivation.normalizeCode(raw);
  if (!code || code.length < 6) {
    return sendError(res, 'activation_code is required', 422, 'VALIDATION_ERROR');
  }

  let out;
  try {
    out = await agentActivation.redeemActivationCode(code);
  } catch (e) {
    if (e.statusCode) return sendError(res, e.message, e.statusCode, e.code || 'ACTIVATE_ERROR');
    throw e;
  }

  if (!out) {
    return sendError(res, 'Invalid or expired activation code', 404, 'ACTIVATION_NOT_FOUND');
  }

  sendSuccess(res, out, 'Activation successful');
});

module.exports = { activate };
