'use strict';

/**
 * LAN bridge: polls one ZKTeco device via zkteco-js (same stack as HR API) and exposes
 * GET /api/v1/bio-sync — compatible with backend/src/services/dtrZktecoBridge.service.js
 *
 * Run:  cd backend && npm run bridge:zk-lan
 *
 * On the HR API set: DTR_ZKTECO_API_URL=http://<bridge-host>:8090
 */

const http = require('http');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const zktecoSocket = require(path.join(__dirname, '..', 'src', 'services', 'zktecoSocket.service.js'));

const DEVICE_IP = String(process.env.ZK_BRIDGE_DEVICE_IP || process.env.ZK_DEVICE_IP || '').trim();
const DEVICE_PORT = (() => {
  const n = Number.parseInt(String(process.env.ZK_BRIDGE_DEVICE_PORT || process.env.ZK_DEVICE_PORT || '4370'), 10);
  return Number.isFinite(n) && n > 0 && n <= 65535 ? n : 4370;
})();
const LISTEN_PORT = (() => {
  const n = Number.parseInt(String(process.env.ZK_BRIDGE_LISTEN_PORT || '8090'), 10);
  return Number.isFinite(n) && n > 0 && n <= 65535 ? n : 8090;
})();
const POLL_MS = (() => {
  const n = Number.parseInt(String(process.env.ZK_BRIDGE_POLL_MS || '45000'), 10);
  return Number.isFinite(n) && n >= 5000 ? Math.min(n, 600000) : 45000;
})();
const SOCKET_TIMEOUT_MS = (() => {
  const n = Number.parseInt(String(process.env.ZK_BRIDGE_SOCKET_TIMEOUT_MS || '120000'), 10);
  return Number.isFinite(n) && n >= 10000 ? Math.min(n, 300000) : 120000;
})();
const BRIDGE_TOKEN = String(process.env.ZK_BRIDGE_TOKEN || '').trim();

let cache = {
  ready: false,
  payload: null,
  lastError: null,
  lastOkAt: null,
  lastAttemptAt: null,
};
let pollRunning = false;

function mapZkUsersToPayload(users) {
  if (!Array.isArray(users)) return [];
  return users.map((u) => {
    const id = String(u.userId != null && u.userId !== '' ? u.userId : (u.uid != null ? u.uid : '')).trim();
    return {
      employee_id: id,
      user_id: id,
      name: String(u.name || '').trim(),
      role: u.role != null ? u.role : 0,
    };
  }).filter((r) => r.employee_id || r.user_id);
}

function mapZkRecordsToLogs(records) {
  if (!Array.isArray(records)) return [];
  return records.map((r) => {
    const employee_id = String(r.user_id != null ? r.user_id : r.userId != null ? r.userId : '').trim();
    let record_time = r.record_time;
    if (record_time instanceof Date) record_time = record_time.toISOString();
    else record_time = String(record_time || '');
    const state = Number.isFinite(Number(r.state)) ? Number(r.state) : 0;
    return {
      employee_id,
      record_time,
      state,
      type: r.type,
      sn: r.sn,
    };
  }).filter((x) => x.employee_id && x.record_time);
}

async function pollOnce() {
  if (!DEVICE_IP) {
    cache.lastError = 'ZK_BRIDGE_DEVICE_IP (or ZK_DEVICE_IP) is not set';
    cache.ready = false;
    return;
  }
  if (pollRunning) return;
  pollRunning = true;
  cache.lastAttemptAt = new Date().toISOString();
  try {
    const pull = await zktecoSocket.fetchAttendanceLogs({
      ip: DEVICE_IP,
      port: DEVICE_PORT,
      socket_timeout_ms: SOCKET_TIMEOUT_MS,
    });
    const users = mapZkUsersToPayload(pull.device_users || []);
    const logs = mapZkRecordsToLogs(pull.records || []);
    const attendanceSize = pull.attendance_size != null ? pull.attendance_size : logs.length;
    cache.payload = {
      users,
      logs,
      device_details: {
        attendanceSize,
        firmware: null,
        currentTime: new Date().toISOString(),
        info: {
          bridge: 'hr-w/zk-lan-bridge',
          connection_type: pull.connection_type || null,
          device_ip: DEVICE_IP,
          device_port: DEVICE_PORT,
          zk_errors: pull.errors || [],
        },
      },
    };
    cache.lastError = pull.ok ? null : (pull.errors?.[0]?.message || 'ZK pull not ok');
    cache.ready = true;
    cache.lastOkAt = new Date().toISOString();
  } catch (e) {
    cache.lastError = e && e.message ? String(e.message) : String(e);
    if (!cache.payload) cache.ready = false;
  } finally {
    pollRunning = false;
  }
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body, 'utf8'),
  });
  res.end(body);
}

function authOk(req) {
  if (!BRIDGE_TOKEN) return true;
  const h = req.headers['x-bridge-token'] || req.headers['x-api-key'];
  return String(h || '').trim() === BRIDGE_TOKEN;
}

const server = http.createServer((req, res) => {
  const url = String(req.url || '').split('?')[0];
  if (req.method === 'GET' && (url === '/health' || url === '/')) {
    sendJson(res, 200, {
      ok: true,
      service: 'zk-lan-bridge',
      device_ip: DEVICE_IP || null,
      listen_port: LISTEN_PORT,
      poll_ms: POLL_MS,
      ready: cache.ready,
      last_ok_at: cache.lastOkAt,
      last_error: cache.lastError,
    });
    return;
  }
  if (req.method === 'GET' && url === '/api/v1/bio-sync') {
    if (!authOk(req)) {
      sendJson(res, 401, {
        error: 'unauthorized',
        message: 'Set X-Bridge-Token or X-Api-Key when ZK_BRIDGE_TOKEN is configured.',
      });
      return;
    }
    if (!cache.ready || !cache.payload) {
      res.writeHead(204);
      res.end();
      return;
    }
    sendJson(res, 200, cache.payload);
    return;
  }
  sendJson(res, 404, { error: 'not_found' });
});

server.listen(LISTEN_PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(
    `[zk-lan-bridge] http://0.0.0.0:${LISTEN_PORT} — GET /api/v1/bio-sync — device ${DEVICE_IP || '(unset)'}:${DEVICE_PORT} — poll ${POLL_MS}ms`,
  );
  if (!DEVICE_IP) {
    // eslint-disable-next-line no-console
    console.warn('[zk-lan-bridge] Set ZK_BRIDGE_DEVICE_IP in zk-lan-bridge/.env or backend/.env');
  }
  pollOnce().catch(() => {});
  setInterval(() => {
    pollOnce().catch(() => {});
  }, POLL_MS);
});
