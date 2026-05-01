'use strict';

/**
 * HTTP client for [dtr.zkteco.api](https://github.com/itechxcellence/dtr.zkteco.api):
 * a LAN service that polls the ZKTeco device and exposes GET /api/v1/bio-sync.
 * Set DTR_ZKTECO_API_URL (e.g. http://192.168.1.5:8090 or your ngrok URL) on the HR API
 * so Vercel/serverless can ingest attendance without opening TCP to private IPs.
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

const DEFAULT_TIMEOUT_MS = 25000;

function httpGetJson(urlStr, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(urlStr);
    } catch (e) {
      reject(e);
      return;
    }
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method: 'GET',
        timeout: timeoutMs,
        headers: {
          Accept: 'application/json',
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode === 204 || (text == null || text === '')) {
            resolve({ statusCode: res.statusCode, json: null });
            return;
          }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const err = new Error(`DTR bridge HTTP ${res.statusCode}: ${text.slice(0, 240)}`);
            err.statusCode = 502;
            reject(err);
            return;
          }
          try {
            resolve({ statusCode: res.statusCode, json: JSON.parse(text) });
          } catch {
            const err = new Error('DTR bridge returned invalid JSON');
            err.statusCode = 502;
            reject(err);
          }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      const err = new Error('DTR bridge request timeout');
      err.statusCode = 504;
      reject(err);
    });
    req.end();
  });
}

async function fetchBioSyncPayload(baseUrl) {
  const base = String(baseUrl || '').trim().replace(/\/$/, '');
  if (!base) return null;
  const { statusCode, json } = await httpGetJson(`${base}/api/v1/bio-sync`);
  if (statusCode === 204 || !json) return null;
  return json;
}

/** Map dtr enrolled user → zkteco-js-like row for HR import / probe. */
function dtrUsersToZkUserSample(users) {
  const arr = Array.isArray(users) ? users : [];
  return arr.map((u) => {
    const idRaw = u.user_id != null ? u.user_id : u.employee_id;
    const uidNum = Number(idRaw);
    const uid = Number.isInteger(uidNum) && uidNum >= 0 ? uidNum : 0;
    return {
      uid,
      userId: String(idRaw != null ? idRaw : '').trim(),
      name: String(u.name || '').trim(),
      role: u.role != null ? u.role : 0,
      cardno: null,
    };
  });
}

/** Map dtr log line → row shape expected by zkAttendanceToPushLog in device.service. */
function dtrLogsToZkAttendanceRecords(logs) {
  const arr = Array.isArray(logs) ? logs : [];
  return arr.map((entry) => ({
    user_id: entry.employee_id,
    userId: entry.employee_id,
    record_time: entry.record_time,
    state: entry.state,
    verify_state: entry.state,
    type: entry.type,
    sn: entry.sn,
    name: entry.name,
  }));
}

/**
 * Same general shape as zktecoSocket.probeSnapshot for UI compatibility.
 */
async function probeSnapshotFromBridge(baseUrl, body = {}) {
  const maxUsers = Math.min(500, Math.max(1, Number(body.max_users) || 80));
  const payload = await fetchBioSyncPayload(baseUrl);
  if (!payload) {
    return {
      ok: false,
      connection_type: 'dtr_bridge',
      library: 'dtr.zkteco.api',
      library_note: 'LAN bridge — https://github.com/itechxcellence/dtr.zkteco.api',
      errors: [{
        step: 'bio-sync',
        message: 'No snapshot yet (HTTP 204 or empty). Ensure the bridge is running and the device is connected.',
        code: 'ZK_BRIDGE_EMPTY',
      }],
      serial_number: null,
      firmware_version: null,
      device_time: null,
      info: null,
      user_sample: null,
      user_count_on_device: null,
      attendance_size: null,
    };
  }

  const users = dtrUsersToZkUserSample(payload.users);
  const details = payload.device_details || {};
  const fw = details.firmware != null ? String(details.firmware) : null;

  return {
    ok: true,
    connection_type: 'dtr_bridge',
    library: 'dtr.zkteco.api',
    library_note: 'LAN bridge — https://github.com/itechxcellence/dtr.zkteco.api',
    errors: [],
    serial_number: null,
    firmware_version: fw,
    device_time: details.currentTime != null ? details.currentTime : null,
    info: details.info != null ? details.info : details,
    user_sample: users.slice(0, maxUsers),
    user_count_on_device: users.length,
    attendance_size: details.attendanceSize != null ? details.attendanceSize : null,
  };
}

module.exports = {
  fetchBioSyncPayload,
  dtrUsersToZkUserSample,
  dtrLogsToZkAttendanceRecords,
  probeSnapshotFromBridge,
  httpGetJson,
};
