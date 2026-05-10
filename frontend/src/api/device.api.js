import api from './axios';
import { shouldRelayLocalAgentToApi, friendlyLocalAgentRelayError } from '../utils/localAgentRelay';

const DEFAULT_AGENT_EXECUTE = 'http://127.0.0.1:8099/execute';

function localAgentExecuteUrl() {
	const u = String(import.meta.env.VITE_LOCAL_AGENT_URL || '').trim().replace(/\/+$/, '');
	if (!u) return DEFAULT_AGENT_EXECUTE;
	return u.includes('/execute') ? u : `${u}/execute`;
}

function localAgentBrowserToken() {
	return String(import.meta.env.VITE_LOCAL_AGENT_TOKEN || '').trim();
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
		device_id: data.device_id,
		port,
		comm_key,
		timeout_ms,
		socket_timeout_ms,
		udp_local_port: data.udp_local_port,
		include_password: data.include_password,
		uid: data.uid,
		is_admin: data.is_admin,
		minimal_probe: data.minimal_probe,
		include_users: data.include_users,
		max_users: data.max_users,
		include_attendance_size: data.include_attendance_size,
		date_from: data.date_from,
		date_to: data.date_to,
		max_records: data.max_records,
		auto_process: data.auto_process,
		overwrite_attendance: data.overwrite_attendance,
		auto_ingest: data.auto_ingest,
	};

	if (shouldRelayLocalAgentToApi()) {
		const agentId = String(import.meta.env.VITE_AGENT_ID || '').trim();
		try {
			const { data: wrap } = await api.post('/devices/local-agent/execute', {
				...body,
				...(agentId ? { agent_id: agentId } : {}),
			});
			const inner = wrap?.data ?? wrap;
			return { status: 200, data: inner };
		} catch (e) {
			const status = e.response?.status ?? 0;
			const payload = e.response?.data;
			return {
				status,
				data: {
					ok: false,
					errors: [{ message: friendlyLocalAgentRelayError(status, payload) }],
					error: friendlyLocalAgentRelayError(status, payload),
				},
			};
		}
	}

	const headers = { 'Content-Type': 'application/json' };
	const tok = localAgentBrowserToken();
	if (tok) headers.Authorization = `Bearer ${tok}`;

	try {
		const resp = await fetch(localAgentExecuteUrl(), {
			method: 'POST',
			headers,
			body: JSON.stringify(body),
		});
		const json = await resp.json().catch(() => null);
		if (!resp.ok) {
			const msg = json?.error || json?.message || '';
			return {
				status: resp.status,
				data: json && typeof json === 'object'
					? { ...json, ok: json.ok === true ? true : false }
					: {
						ok: false,
						error: msg || 'تعذّر الاتصال بالوكيل المحلي.',
						errors: [{ message: msg || 'تعذّر الاتصال بالوكيل المحلي.' }],
					},
			};
		}
		return { status: resp.status, data: json };
	} catch {
		return {
			status: 0,
			data: {
				ok: false,
				error:
					'تعذّر الاتصال ببرنامج «وكيل الشبكة» على هذه الحاسبة (المنفذ 8099). ثبّت الوكيل الذي زوّدك به المسؤول، أو افتح البرنامج من الحاسبة التي عليها الوكيل.',
				errors: [
					{
						message:
							'تعذّر الاتصال ببرنامج «وكيل الشبكة» على هذه الحاسبة. تأكد من تثبيت الوكيل وتشغيله.',
					},
				],
			},
		};
	}
}

// ── Devices ──────────────────────────────────────────────────────────────────
export const listDevices = (params) => api.get('/devices', { params });
/** Active employees for device sync UI (works without `employees` company feature). */
export const listDeviceEmployeeOptions = (params) => api.get('/devices/employee-options', { params });
export const getDevice = (id) => api.get(`/devices/${id}`);
export const createDevice = (data) => api.post('/devices', data);
/** Legacy HTTP probe (web panel). Prefer `probeZkSocket` for ZKTeco; kept for HYBRID / Fingertic fallback. */
export const probeDeviceConnection = (data) => api.post('/devices/probe-connection', data);
/** Scan IPv4 range and return reachable ZK devices. */
export const scanZkRange = (data) => api.post('/devices/scan-zk-range', data || {});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Poll GET /job-status/:id until terminal state or timeout.
 * @returns {{ ok: boolean, row?: object, timedOut?: boolean }}
 */
async function pollAgentJob(jobId, { maxWaitMs = 45000, intervalMs = 800 } = {}) {
	const deadline = Date.now() + maxWaitMs;
	let row;
	while (Date.now() < deadline) {
		const { data: wrap } = await api.get(`/job-status/${jobId}`);
		row = wrap?.data;
		const status = row?.status;
		if (status === 'success') return { ok: true, row };
		if (status === 'failed' || status === 'timeout') return { ok: false, row };
		await sleep(intervalMs);
	}
	return { ok: false, row, timedOut: true };
}

/**
 * LAN HTTP probe: on public API hosts (e.g. Vercel) uses agent job queue (outbound polling) when
 * VITE_AGENT_ID is set — no inbound tunnel to the agent. Locally, POST /probe-device (sync) when relay is off.
 */
export async function probeDeviceViaAgent(data = {}) {
	if (!shouldRelayLocalAgentToApi()) {
		const agentId = String(import.meta.env.VITE_AGENT_ID || '').trim();
		const ip = data.device_ip || data.ip_address;
		return api.post('/probe-device', {
			...data,
			ip_address: ip,
			device_ip: ip,
			...(agentId ? { agent_id: agentId } : {}),
		});
	}

	const agentId = String(data.agent_id || import.meta.env.VITE_AGENT_ID || '').trim();
	if (!agentId) {
		return {
			data: {
				success: false,
				message: 'VITE_AGENT_ID',
				data: {
					ok: false,
					error:
						'على الاستضافة السحابية: عيّن VITE_AGENT_ID في بيئة الواجهة (مثل office_1) ليطابق AGENT_ID على حاسبة الوكيل، أو اضبط LOCAL_AGENT_URL على الـ API لنفق يصل للوكيل.',
					errors: [{ message: 'Set VITE_AGENT_ID (same as agent .env AGENT_ID) or use LOCAL_AGENT_URL on the API.' }],
				},
			},
		};
	}

	try {
		const { data: wrap } = await api.post('/device-agent/jobs', {
			agent_id: agentId,
			action: 'probe',
			device_ip: data.device_ip || data.ip_address,
			port: Number.isFinite(Number(data.port)) && Number(data.port) > 0 ? Number(data.port) : 80,
			timeout_ms: data.timeout_ms ?? 1200,
		});
		const jobId = wrap?.data?.job_id;
		if (!jobId) {
			return {
				data: {
					success: false,
					data: {
						ok: false,
						error: wrap?.message || 'لم يُرجع الخادم رقم مهمة',
						errors: [{ message: 'No job_id from server' }],
					},
				},
			};
		}
		const polled = await pollAgentJob(jobId);
		if (polled.timedOut) {
			return {
				data: {
					success: false,
					data: {
						ok: false,
						error: 'انتهت مهلة انتظار الوكيل. تأكد أن polling-agent يعمل على الشبكة الداخلية وأن AGENT_SHARED_TOKEN و ALLOWED_AGENT_IDS مضبوطة على الخادم.',
						errors: [{ message: 'Agent job poll timeout' }],
					},
				},
			};
		}
		if (!polled.ok) {
			const errObj = polled.row?.error;
			const msg = typeof errObj === 'string' ? errObj : (errObj?.message || polled.row?.result?.message || 'فشلت مهمة الفحص');
			return {
				data: {
					success: false,
					data: {
						ok: false,
						error: msg,
						errors: [{ message: msg }],
						...(polled.row?.result && typeof polled.row.result === 'object' ? polled.row.result : {}),
					},
				},
			};
		}
		const probe = polled.row?.result;
		const payload = probe && typeof probe === 'object' ? probe : { ok: false, error: 'Empty agent result' };
		return {
			data: {
				success: true,
				message: 'Probe completed via LAN agent queue',
				data: payload,
			},
		};
	} catch (e) {
		const status = e.response?.status ?? 0;
		const payload = e.response?.data;
		const msg = friendlyLocalAgentRelayError(status, payload) || e.message || 'probe queue failed';
		return {
			data: {
				success: false,
				data: {
					ok: false,
					error: msg,
					errors: [{ message: msg }],
				},
			},
		};
	}
}
/** Try calling the local agent directly from the browser (localhost). Returns { status, data } or throws. */
export const probeLocalAgent = (data) => callLocalAgent('probe', data);
/** ZK snapshot via local agent (same LAN as device) — use device ZK port (e.g. 4370), not HTTP 80. */
export const probeZkSnapshotLocalAgent = (data) => callLocalAgent('zk_probe_snapshot', data);
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
