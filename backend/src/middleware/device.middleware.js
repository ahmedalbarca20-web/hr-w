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

async function authenticateDevice(req, res, next) {
  const serial  = req.headers['x-device-serial'];
  const apiKey  = req.headers['x-device-key'];

  if (!serial || !apiKey) {
    return sendError(res, 'Missing X-Device-Serial or X-Device-Key header', 401, 'DEVICE_UNAUTHORIZED');
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
