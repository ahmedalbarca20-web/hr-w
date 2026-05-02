'use strict';

/**
 * Update a device row `ip_address` (LAN only — does not change router or firewall).
 *
 * Usage (from backend/):
 *   DEVICE_ID=2 DEVICE_IP=192.168.0.47 node scripts/set-device-lan-ip.js
 *
 * Requires backend/.env with DATABASE_URL (or Sequelize env vars).
 */

require('dotenv').config();

const { Device } = require('../src/models/device.model');

async function main() {
  const id = Number.parseInt(String(process.env.DEVICE_ID || '').trim(), 10);
  const ip = String(process.env.DEVICE_IP || '').trim();
  if (!Number.isInteger(id) || id < 1) {
    // eslint-disable-next-line no-console
    console.error('Missing or invalid DEVICE_ID. Example: DEVICE_ID=2 DEVICE_IP=192.168.0.47 node scripts/set-device-lan-ip.js');
    process.exit(1);
  }
  if (!ip) {
    // eslint-disable-next-line no-console
    console.error('Missing DEVICE_IP.');
    process.exit(1);
  }

  const [n] = await Device.update({ ip_address: ip }, { where: { id } });
  // eslint-disable-next-line no-console
  console.log(`Updated devices rows: ${n} (id=${id} → ip_address=${ip})`);
  if (n === 0) {
    // eslint-disable-next-line no-console
    console.warn('No row matched. Check DEVICE_ID exists in table devices.');
    process.exit(2);
  }
  process.exit(0);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
