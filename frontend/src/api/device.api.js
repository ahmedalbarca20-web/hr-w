import api from './axios';

const DEFAULT_AGENT_EXECUTE = 'http://127.0.0.1:8099/execute';

function localAgentExecuteUrl() {
	const u = String(import.meta.env.VITE_LOCAL_AGENT_URL || '').trim().replace(/\/+$/, '');
	if (!u) return DEFAULT_AGENT_EXECUTE;
	return u.includes('/execute') ? u : `${u}/execute`;
}

function localAgentBrowserToken() {
	return String(import.meta.env.VITE_LOCAL_AGENT_TOKEN || '').trim();
}

/**
 * When true, ZK calls go HR API → LOCAL_AGENT_URL (ngrok) instead of browser → 127.0.0.1.
 * Set VITE_LOCAL_AGENT_RELAY=1 on production if the UI is hosted remotely.
 */
function useLocalAgentRelay() {
	const v = String(import.meta.env.VITE_LOCAL_AGENT_RELAY || '').trim().toLowerCase();
	return v === '1' || v === 'true' || v === 'always';
}

async function callLocalAgent(action, data = {}) {
	const device_ip = data.device_ip || data.ip_address || data.ip;
	const port = data.port;
	const comm_key = data.comm_key;
	const timeout_ms = data.timeout_ms;
	const socket_timeout_ms = data.socket_timeout_ms ?? data.timeout_ms;

	const body = {
		action,
		device_ip,
		ip_address: device_ip,
		port,
		comm_key,
		timeout_ms,
		socket_timeout_ms,
		udp_local_port: data.udp_local_port,
		include_password: data.include_password,
		uid: data.uid,
		is_admin: data.is_admin,
	};

	if (useLocalAgentRelay()) {
		try {
			const { data: wrap } = await api.post('/devices/local-agent/execute', body);
			const inner = wrap?.data ?? wrap;
			return { status: 200, data: inner };
		} catch (e) {
			const status = e.response?.status ?? 0;
			const payload = e.response?.data;
			const msg = payload?.error || payload?.message || e.message || 'Local agent relay failed';
			return {
				status,
				data: payload?.data ?? payload ?? { ok: false, error: typeof msg === 'string' ? msg : 'Relay failed' },
			};
		}
	}

	const headers = { 'Content-Type': 'application/json' };
	const tok = localAgentBrowserToken();
	if (tok) headers.Authorization = `Bearer ${tok}`;

	const resp = await fetch(localAgentExecuteUrl(), {
		method: 'POST',
		headers,
		body: JSON.stringify(body),
	});
	const json = await resp.json().catch(() => null);
	return { status: resp.status, data: json };
}

// ── Devices ──────────────────────────────────────────────────────────────────
export const listDevices = (params) => api.get('/devices', { params });
/** Active employees for device sync UI (works without `employees` company feature). */
export const listDeviceEmployeeOptions = (params) => api.get('/devices/employee-options', { params });
export const getDevice = (id) => api.get(`/devices/${id}`);
export const createDevice = (data) => api.post('/devices', data);
/** Legacy HTTP probe (web panel). Prefer `probeZkSocket` for ZKTeco; kept for HYBRID / Fingertic fallback. */
export const probeDeviceConnection = (data) => api.post('/devices/probe-connection', data);
/** Local-network relay probe via backend + local agent. Preferred for private LAN device checks. */
export const probeDeviceViaAgent = (data) => api.post('/probe-device', data);
/** Try calling the local agent directly from the browser (localhost). Returns { status, data } or throws. */
export const probeLocalAgent = (data) => callLocalAgent('probe', data);
/** ZK binary protocol (zkteco-js) — TCP/UDP; optional fields: socket_timeout_ms, udp_local_port, include_users, max_users */
export const probeZkSocket = (data) => api.post('/devices/probe-zk-socket', data);
/** Combined diagnostics: ZK path + HTTP probe + runtime env hints. */
export const debugZkConnection = (data) => api.post('/devices/debug-zk-connection', data);
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
export const importDeviceZkAttendanceDirect = (id, body) => api.post(`/devices/${id}/zk-import-attendance-direct`, body || {});
export const importDeviceZkUsersDirect = (id, body) => api.post(`/devices/${id}/zk-import-users-direct`, body || {});
export const pullAttendanceLocalAgent = (data) => callLocalAgent('pull_attendance', data);
export const listUsersLocalAgent = (data) => callLocalAgent('list_users', data);
export const getDevicePushConfig = (id) => api.get(`/devices/${id}/push-config`);
export const testDeviceIngest = (id, body) => api.post(`/devices/${id}/test-ingest`, body || {});
export const updateDevice = (id, d) => api.put(`/devices/${id}`, d);
export const deleteDevice = (id) => api.delete(`/devices/${id}`);
export const rotateKey = (id) => api.post(`/devices/${id}/rotate-key`);
export const syncDeviceUsers = (id, employee_ids) => api.post(`/devices/${id}/sync-users`, { employee_ids });

// ── Raw Logs ──────────────────────────────────────────────────────────────────
export const listLogs = (params) => api.get('/devices/logs', { params });
export const getLog = (id) => api.get(`/devices/logs/${id}`);
export const reprocessLog = (id) => api.patch(`/devices/logs/${id}/reprocess`);
export const reResolveLogs = () => api.post('/devices/logs/re-resolve-unresolved');
