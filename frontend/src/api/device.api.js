import api from './axios';

// ── Devices ──────────────────────────────────────────────────────────────────
export const listDevices    = (params) => api.get('/devices', { params });
/** Active employees for device sync UI (works without `employees` company feature). */
export const listDeviceEmployeeOptions = (params) => api.get('/devices/employee-options', { params });
export const getDevice      = (id)     => api.get(`/devices/${id}`);
export const createDevice   = (data)   => api.post('/devices', data);
/** Legacy HTTP probe (web panel). Prefer `probeZkSocket` for ZKTeco; kept for HYBRID / Fingertic fallback. */
export const probeDeviceConnection = (data) => api.post('/devices/probe-connection', data);
/** ZK binary protocol (zkteco-js) — TCP/UDP; optional fields: socket_timeout_ms, udp_local_port, include_users, max_users */
export const probeZkSocket = (data) => api.post('/devices/probe-zk-socket', data);
export const readZkFromDevice = (id, body) => api.post(`/devices/${id}/zk-socket-read`, body || {});
/** Live users on device (ZK). Query: ?port=4370&include_password=true (PIN is sensitive; default off). */
export const getDeviceZkUsers = (id, params) => api.get(`/devices/${id}/zk-device-users`, { params });
/** Body: { uids, port?, include_password? } — upserts employees by card/userId */
export const importDeviceZkUsers = (id, body) => api.post(`/devices/${id}/zk-import-users`, body);
/** Body: { uid, is_admin, port?, socket_timeout_ms? } — ZK device terminal admin (role 14) vs normal (0). */
export const setZkDeviceUserPrivilege = (id, body) => api.post(`/devices/${id}/zk-set-user-privilege`, body);
/** فك قفل شاشة الجهاز (ZK enable) — body اختياري: port, socket_timeout_ms */
export const unlockZkDevice = (id, body) => api.post(`/devices/${id}/zk-unlock`, body || {});
/** Pull attendance from ZK device into raw logs; body: { port?, date_from?, date_to?, max_records?, auto_process?, socket_timeout_ms? } */
export const importDeviceZkAttendance = (id, body) => api.post(`/devices/${id}/zk-import-attendance`, body || {});
export const getDevicePushConfig   = (id)     => api.get(`/devices/${id}/push-config`);
export const testDeviceIngest      = (id, body) => api.post(`/devices/${id}/test-ingest`, body || {});
export const updateDevice   = (id, d)  => api.put(`/devices/${id}`, d);
export const deleteDevice   = (id)     => api.delete(`/devices/${id}`);
export const rotateKey      = (id)     => api.post(`/devices/${id}/rotate-key`);
export const syncDeviceUsers= (id, employee_ids) => api.post(`/devices/${id}/sync-users`, { employee_ids });

// ── Raw Logs ──────────────────────────────────────────────────────────────────
export const listLogs       = (params) => api.get('/devices/logs', { params });
export const getLog         = (id)     => api.get(`/devices/logs/${id}`);
export const reprocessLog   = (id)     => api.patch(`/devices/logs/${id}/reprocess`);
export const reResolveLogs   = ()       => api.post('/devices/logs/re-resolve-unresolved');
