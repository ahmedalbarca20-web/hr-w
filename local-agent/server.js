'use strict';

require('dotenv').config();

const express = require('express');
const axios = require('axios');
const iconv = require('iconv-lite');
const zktecoSocket = require('../backend/src/services/zktecoSocket.service');

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = Number(process.env.LOCAL_AGENT_PORT || 8099);
const TOKEN = String(process.env.LOCAL_AGENT_TOKEN || '').trim();
const DEFAULT_TIMEOUT_MS = 800;

if (!TOKEN) {
  // Run in permissive localhost-only mode when no token is provided.
  // This allows the browser on the same machine to call the agent without a token.
  // WARNING: ensure only localhost can reach the agent when running without a token.
  // Log a visible warning for operators.
  // eslint-disable-next-line no-console
  console.warn('LOCAL_AGENT_TOKEN not set — running in permissive localhost-only mode.');
}

function log(event, data = {}) {
  // Structured one-line logs for easy grep in terminal/log forwarders.
  const payload = { at: new Date().toISOString(), event, ...data };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload));
}

function auth(req, res, next) {
  const raw = String(req.headers.authorization || '');
  const headerToken = raw.startsWith('Bearer ') ? raw.slice(7).trim() : '';

  // Always log for debugging
  const remoteAddress = req.socket?.remoteAddress || req.connection?.remoteAddress || req.ip || 'unknown';
  const isLocalhost = remoteAddress === '127.0.0.1' 
    || remoteAddress === '::1' 
    || remoteAddress === 'localhost'
    || remoteAddress.startsWith('::ffff:127.0.0.1');

  log('auth_attempt', { 
    remoteAddress,
    isLocalhost,
    hasToken: Boolean(TOKEN),
    hasHeader: Boolean(headerToken)
  });

  // If TOKEN is not set, run in permissive mode (local machine only)
  if (!TOKEN) {
    log('auth_permissive_mode', { remoteAddress });
    return next();
  }

  // If TOKEN is set, allow:
  // 1. Requests with matching token
  if (headerToken === TOKEN) {
    log('auth_token_matched', { remoteAddress });
    return next();
  }

  // 2. Requests from localhost (no token needed)
  if (isLocalhost) {
    log('auth_localhost_allowed', { remoteAddress });
    return next();
  }

  // Deny otherwise
  log('auth_denied', { remoteAddress, isLocalhost });
  return res.status(401).json({ ok: false, error: 'Unauthorized' });
}

// Simple CORS for browser-local calls (only necessary when frontend tries to call http://127.0.0.1:8099)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function toHostLiteral(host) {
  const h = String(host || '').trim();
  if (!h) return '';
  // IPv6 URL literal
  if (h.includes(':') && !h.startsWith('[')) return `[${h}]`;
  return h;
}

function extractSerial(text) {
  const body = String(text || '');
  const m1 = body.match(/~SerialNumber=([^&\s~\r\n]+)/i);
  if (m1?.[1]) return m1[1].trim();
  const m2 = body.match(/SerialNumber\s*[:=]\s*([A-Za-z0-9_.\-]{4,80})/i);
  if (m2?.[1]) return m2[1].trim();
  const m3 = body.match(/^\s*OK\s*,?\s*([A-Za-z0-9_.\-]{4,80})\s*$/im);
  if (m3?.[1]) return m3[1].trim();
  return '';
}

function decodeMojibakeUtf8Latin1(s) {
  const src = String(s || '');
  if (!/[ØÙÚÛÇÐ]/.test(src)) return src;
  try {
    return Buffer.from(src, 'latin1').toString('utf8');
  } catch {
    return src;
  }
}

function decodeBest(bodyBuf) {
  const cands = [];
  const add = (v) => {
    const clean = String(v || '').replace(/\uFFFD/g, '').replace(/\0/g, '').trim();
    if (clean) cands.push(clean);
  };

  add(bodyBuf.toString('utf8'));
  add(bodyBuf.toString('latin1'));
  try { add(iconv.decode(bodyBuf, 'windows-1256')); } catch { /* ignore */ }

  const fixed = cands.flatMap((x) => [x, decodeMojibakeUtf8Latin1(x)]);
  const unique = [...new Set(fixed)];
  unique.sort((a, b) => {
    const arA = (a.match(/[\u0600-\u06FF]/g) || []).length;
    const arB = (b.match(/[\u0600-\u06FF]/g) || []).length;
    if (arA !== arB) return arB - arA;
    return b.length - a.length;
  });
  return unique[0] || '';
}

async function getWithRetry(url, timeoutMs) {
  let lastErr;
  for (let i = 0; i < 2; i += 1) {
    try {
      const resp = await axios.get(url, {
        timeout: timeoutMs,
        responseType: 'arraybuffer',
        validateStatus: () => true,
      });
      return resp;
    } catch (e) {
      lastErr = e;
      const isTimeout = e?.code === 'ECONNABORTED' || /timeout/i.test(String(e?.message || ''));
      if (!isTimeout || i === 1) throw e;
    }
  }
  throw lastErr;
}

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'hr-w-local-agent', at: new Date().toISOString() });
});

async function runProbe({ ip, port, timeoutMsRaw }) {
  const timeoutMs = Math.min(1000, Math.max(200, Number.isFinite(timeoutMsRaw) ? timeoutMsRaw : DEFAULT_TIMEOUT_MS));
  const host = toHostLiteral(ip);
  const path = '/cgi-bin/getoption.cgi?action=getoption&kind=SerialNumber';
  const url = `http://${host}:${port}${path}`;
  const started = Date.now();

  try {
    const resp = await getWithRetry(url, timeoutMs);
    const bodyBuf = Buffer.from(resp.data || '');
    const decoded = decodeBest(bodyBuf);
    const serial = extractSerial(decoded);
    const reachable = Number(resp.status) >= 200 && Number(resp.status) < 500;
    const out = {
      ok: reachable,
      serial_number: serial || null,
      status: resp.status,
      probed_url: url,
      duration_ms: Date.now() - started,
      source: 'local_agent',
      decoded_text_sample: decoded.slice(0, 250),
      message: serial
        ? 'Serial read successfully'
        : (reachable ? 'Device reachable but serial not parsed' : 'Device probe failed'),
    };
    log('probe_success', { ip, port, ms: out.duration_ms, ok: out.ok, status: resp.status });
    return out;
  } catch (e) {
    const code = e?.code || null;
    const msg = String(e?.message || 'request failed');
    const isTimeout = code === 'ECONNABORTED' || /timeout/i.test(msg);
    const isConnectionReset = code === 'ECONNRESET';
    const reachableByReset = isConnectionReset && /read ECONNRESET/i.test(msg);
    const out = {
      ok: reachableByReset,
      serial_number: null,
      source: 'local_agent',
      duration_ms: Date.now() - started,
      code,
      message: isTimeout
        ? 'Device timeout'
        : (reachableByReset ? 'Device reachable but closed connection before serial response' : msg),
      hint: isTimeout
        ? 'تحقق من IP الجهاز والمنفذ وأن الجهاز online على نفس LAN'
        : (reachableByReset ? 'يمكن المتابعة وحفظ الجهاز وإدخال السيريال يدويا' : 'تحقق من الشبكة والجدار الناري'),
    };
    log(
      isTimeout ? 'probe_timeout' : (reachableByReset ? 'probe_reachable_connreset' : 'probe_fail'),
      { ip, port, ms: out.duration_ms, code, message: msg, ok: out.ok },
    );
    return out;
  }
}

app.post('/probe-connection', auth, async (req, res) => {
  const ip = String(req.body?.ip_address || '').trim();
  const port = Number.isFinite(Number(req.body?.port)) && Number(req.body.port) > 0 ? Number(req.body.port) : 80;
  const timeoutMsRaw = Number(req.body?.timeout_ms || DEFAULT_TIMEOUT_MS);
  if (!ip) return res.status(422).json({ ok: false, error: 'ip_address is required' });
  const out = await runProbe({ ip, port, timeoutMsRaw });
  return res.status(200).json(out);
});

app.post('/execute', auth, async (req, res) => {
  const action = String(req.body?.action || '').trim().toLowerCase();
  const ip = String(req.body?.device_ip || req.body?.ip_address || '').trim();
  const defaultPort = action === 'list_users' ? 4370 : 80;
  const port = Number.isFinite(Number(req.body?.port)) && Number(req.body.port) > 0 ? Number(req.body.port) : defaultPort;
  const timeoutMsRaw = Number(req.body?.timeout_ms || DEFAULT_TIMEOUT_MS);
  if (!ip) return res.status(422).json({ ok: false, error: 'device_ip is required' });

  if (action === 'probe') {
    const out = await runProbe({ ip, port, timeoutMsRaw });
    return res.status(200).json(out);
  }

  if (action === 'list_users') {
    const socketTimeoutMs = Number.isFinite(Number(req.body?.socket_timeout_ms))
      ? Math.min(120000, Math.max(8000, Number(req.body.socket_timeout_ms)))
      : 45000;
    const udpLocalPort = Number.isFinite(Number(req.body?.udp_local_port))
      ? Math.min(65535, Math.max(1024, Number(req.body.udp_local_port)))
      : 5000;
    const started = Date.now();
    const result = await zktecoSocket.fetchZkUsersList({
      ip,
      port: Number.isFinite(Number(port)) && Number(port) > 0 ? Number(port) : 4370,
      socket_timeout_ms: socketTimeoutMs,
      udp_local_port: udpLocalPort,
    });
    log(result?.ok ? 'list_users_success' : 'list_users_fail', {
      ip,
      port,
      ms: Date.now() - started,
      ok: Boolean(result?.ok),
      count: Array.isArray(result?.users) ? result.users.length : 0,
    });
    return res.status(200).json({
      ok: Boolean(result?.ok),
      users: Array.isArray(result?.users) ? result.users : [],
      user_count_on_device: Array.isArray(result?.users) ? result.users.length : 0,
      errors: Array.isArray(result?.errors) ? result.errors : [],
      connection_type: result?.connection_type || null,
      source: 'local_agent',
      duration_ms: Date.now() - started,
    });
  }

  if (action === 'pull_attendance') {
    const socketTimeoutMs = Number.isFinite(Number(req.body?.socket_timeout_ms))
      ? Math.min(120000, Math.max(8000, Number(req.body.socket_timeout_ms)))
      : 90000;
    const started = Date.now();
    const result = await zktecoSocket.fetchAttendanceLogs({
      ip,
      port: Number.isFinite(Number(port)) && Number(port) > 0 ? Number(port) : 4370,
      socket_timeout_ms: socketTimeoutMs,
    });
    log(result?.ok ? 'pull_attendance_success' : 'pull_attendance_fail', {
      ip,
      port,
      ms: Date.now() - started,
      ok: Boolean(result?.ok),
      count: Array.isArray(result?.records) ? result.records.length : 0,
    });
    return res.status(200).json({
      ok: Boolean(result?.ok),
      connection_type: result?.connection_type || null,
      attendance_size: result?.attendance_size ?? null,
      records: Array.isArray(result?.records) ? result.records : [],
      device_users: Array.isArray(result?.device_users) ? result.device_users : [],
      errors: Array.isArray(result?.errors) ? result.errors : [],
      attendance_retry_without_disable: Boolean(result?.attendance_retry_without_disable),
      source: 'local_agent',
      duration_ms: Date.now() - started,
    });
  }

  return res.status(400).json({ ok: false, error: 'Unknown action' });
});

app.listen(PORT, '0.0.0.0', () => {
  log('agent_started', { port: PORT, token_protected: Boolean(TOKEN) });
});
