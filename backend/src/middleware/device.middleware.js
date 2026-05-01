'use strict';

/**
 * Device-level authentication middleware.
 *
 * Devices authenticate using two headers (NOT user JWTs):
 *   X-Device-Serial  – the device's serial number
 *   X-Device-Key     – the device's API key (set at registration, rotatable)
 *
 * On success:   req.device is populated with the full Device record.
 * On failure:   401 DEVICE_UNAUTHORIZED
 *
 * Usage:
 *   router.post('/push', authenticateDevice, ctrl.push);
 */

const { Device }            = require('../models/device.model');
const { sendError }         = require('../utils/response');

function firstNonEmpty(...values) {
  for (const v of values) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return null;
}

async function authenticateDevice(req, res, next) {
  const bodyObj = req.body && typeof req.body === 'object' ? req.body : {};
  const serial = firstNonEmpty(
    req.headers['x-device-serial'],
    req.query?.serial,
    req.query?.serial_number,
    req.query?.sn,
    req.query?.SN,
    bodyObj.serial,
    bodyObj.serial_number,
    bodyObj.sn,
    bodyObj.SN,
  );
  const apiKey = firstNonEmpty(
    req.headers['x-device-key'],
    req.query?.key,
    req.query?.api_key,
    req.query?.token,
    bodyObj.key,
    bodyObj.api_key,
    bodyObj.token,
  );

  if (!serial || !apiKey) {
    return sendError(
      res,
      'Missing device credentials. Provide headers (X-Device-Serial + X-Device-Key) or query/body fields (SN/serial + key).',
      401,
      'DEVICE_UNAUTHORIZED',
    );
  }

  // company_id context: optionally passed as X-Company-Id for super-admin testing,
  // but normally the company is resolved from the device record itself.
  const device = await Device.findOne({ where: { serial_number: serial, api_key: apiKey } })
    .catch(() => null);

  if (!device) {
    return sendError(res, 'Invalid device credentials', 401, 'DEVICE_UNAUTHORIZED');
  }

  if (device.status !== 'ACTIVE') {
    return sendError(res, `Device is ${device.status.toLowerCase()}`, 403, 'DEVICE_INACTIVE');
  }

  req.device = device;
  next();
}

module.exports = { authenticateDevice };
