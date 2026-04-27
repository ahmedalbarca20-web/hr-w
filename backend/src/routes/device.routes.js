'use strict';

/**
 * Device Management Routes
 * All prefixed /api/devices
 *
 * ── Device-to-server (hardware device auth — X-Device-Serial + X-Device-Key) ──
 *   POST   /push                   Push a batch of raw logs from the device
 *   POST   /heartbeat              Device heartbeat / status update
 *
 * ── HR/Admin user routes (JWT auth) ─────────────────────────────────────────
 *   GET    /                       List all devices in company (?department_id= optional)
 *   POST   /                       Register a new device (returns api_key once)
 *   GET    /employee-options       Active employees for sync picker (devices feature only)
 *   POST   /probe-connection       Test HTTP reachability & try to read serial (LAN)
 *   POST   /probe-zk-socket       ZK TCP/UDP via zkteco-js (serial, users sample, etc.)
 *   POST   /:id/zk-socket-read     Same as probe-zk-socket using saved device ip_address
 *   GET    /:id/zk-device-users    Live users from device (zkteco-js getUsers)
 *   POST   /:id/zk-import-users    Import selected device UIDs → employees (create/update)
 *   POST   /:id/zk-set-user-privilege  Grant or revoke ZK terminal admin (role 14 vs 0) for one UID
 *   POST   /:id/zk-unlock           ZK CMD_ENABLE_DEVICE only (unlock screen after stuck disable)
 *   POST   /:id/zk-import-attendance Pull ZK attendance buffer → device_logs (+ optional process)
 *   GET    /:id/push-config        URLs + curl for configuring device → server push
 *   POST   /:id/test-ingest        HR: insert one test log (same pipeline as /push)
 *   GET    /:id                    Get device details
 *   PUT    /:id                    Update device (name, location, mode, type, etc.)
 *   DELETE /:id                    Deactivate device
 *   POST   /:id/rotate-key         Rotate device API key
 *
 * ── Raw log queries (HR|ADMIN) ───────────────────────────────────────────────
 *   GET    /logs                   List raw device logs (filterable)
 *   GET    /logs/:id               Get a single raw log with full raw_payload
 *   PATCH  /logs/:id/reprocess     Reset log so attendance processor picks it up
 */

const { Router } = require('express');
const ctrl = require('../controllers/device.controller');
const { authenticate }       = require('../middleware/auth.middleware');
const { requireRole, requireFeature } = require('../middleware/role.middleware');
const { authenticateDevice } = require('../middleware/device.middleware');

const r = Router();
const HR_ADMIN = ['ADMIN', 'HR'];

// ── Device-to-server endpoints (device API key, no user JWT) ─────────────────
r.post('/push',      authenticateDevice, ctrl.push);
r.post('/heartbeat', authenticateDevice, ctrl.heartbeat);

// ── All remaining routes require a valid user JWT ────────────────────────────
r.use(authenticate);
r.use(requireFeature('devices'));

// Log queries — placed before /:id so /logs doesn't match :id = 'logs'
r.get  ('/logs',              requireRole(...HR_ADMIN), ctrl.listLogs);
r.get  ('/logs/:id',          requireRole(...HR_ADMIN), ctrl.getLog);
r.patch('/logs/:id/reprocess',requireRole(...HR_ADMIN), ctrl.reprocessLog);
r.post ('/logs/re-resolve-unresolved', requireRole(...HR_ADMIN), ctrl.reResolveLogs);

// Device CRUD
r.get   ('/',           requireRole(...HR_ADMIN), ctrl.listDevices);
r.post  ('/',           requireRole('ADMIN'),     ctrl.createDevice);
r.get   ('/employee-options', requireRole(...HR_ADMIN), ctrl.listEmployeeOptions);
r.post  ('/probe-connection', requireRole(...HR_ADMIN), ctrl.probeConnection);
r.post  ('/probe-zk-socket', requireRole(...HR_ADMIN), ctrl.probeZkSocket);
r.post  ('/:id/sync-users', requireRole(...HR_ADMIN), ctrl.syncUsers);
r.post  ('/:id/zk-socket-read', requireRole(...HR_ADMIN), ctrl.readZkFromDevice);
r.get   ('/:id/zk-device-users', requireRole(...HR_ADMIN), ctrl.listZkDeviceUsers);
r.post  ('/:id/zk-import-users', requireRole(...HR_ADMIN), requireFeature('employees'), ctrl.importZkUsersToEmployees);
r.post  ('/:id/zk-set-user-privilege', requireRole(...HR_ADMIN), ctrl.setZkDeviceUserPrivilege);
r.post  ('/:id/zk-unlock', requireRole(...HR_ADMIN), ctrl.unlockDeviceZkSession);
r.post  ('/:id/zk-import-attendance', requireRole(...HR_ADMIN), ctrl.importZkAttendances);
r.get   ('/:id/push-config', requireRole(...HR_ADMIN), ctrl.getPushConfig);
r.post  ('/:id/test-ingest', requireRole(...HR_ADMIN), ctrl.testDeviceIngest);
r.get   ('/:id',        requireRole(...HR_ADMIN), ctrl.getDevice);
r.put   ('/:id',        requireRole('ADMIN'),     ctrl.updateDevice);
r.delete('/:id',        requireRole('ADMIN'),     ctrl.deactivateDevice);
r.post  ('/:id/rotate-key', requireRole('ADMIN'), ctrl.rotateApiKey);

module.exports = r;
