'use strict';

const express = require('express');
const axios = require('axios');
const iconv = require('iconv-lite');

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = Number(process.env.LOCAL_AGENT_PORT || 8099);
const TOKEN = String(process.env.LOCAL_AGENT_TOKEN || '').trim();
const DEFAULT_TIMEOUT_MS = 1000;

if (!TOKEN) {
  throw new Error('LOCAL_AGENT_TOKEN is required for secure mode');
}

function log(event, data = {}) {
  // Structured one-line logs for easy grep in terminal/log forwarders.
  const payload = { at: new Date().toISOString(), event, ...data };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload));
}

function auth(req, res, next) {
  const raw = String(req.headers.authorization || '');
  const ok = raw.startsWith('Bearer ') && raw.slice(7).trim() === TOKEN;
  if (!ok) {
    log('auth_denied', { ip: req.ip, path: req.path });
    return res.status(401).json({ ok: false, error: 'Unauthorized local agent token' });
  }
  return next();
}

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
    const out = {
      ok: Boolean(serial),
      serial_number: serial || null,
      status: resp.status,
      probed_url: url,
      duration_ms: Date.now() - started,
      source: 'local_agent',
      decoded_text_sample: decoded.slice(0, 250),
      message: serial ? 'Serial read successfully' : 'Device responded but serial not parsed',
    };
    log('probe_success', { ip, port, ms: out.duration_ms, ok: out.ok, status: resp.status });
    return out;
  } catch (e) {
    const code = e?.code || null;
    const msg = String(e?.message || 'request failed');
    const isTimeout = code === 'ECONNABORTED' || /timeout/i.test(msg);
    const out = {
      ok: false,
      serial_number: null,
      source: 'local_agent',
      duration_ms: Date.now() - started,
      code,
      message: isTimeout ? 'Device timeout' : msg,
      hint: isTimeout ? 'تحقق من IP الجهاز والمنفذ وأن الجهاز online على نفس LAN' : 'تحقق من الشبكة والجدار الناري',
    };
    log(isTimeout ? 'probe_timeout' : 'probe_fail', { ip, port, ms: out.duration_ms, code, message: msg });
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
  const port = Number.isFinite(Number(req.body?.port)) && Number(req.body.port) > 0 ? Number(req.body.port) : 80;
  const timeoutMsRaw = Number(req.body?.timeout_ms || DEFAULT_TIMEOUT_MS);
  if (action !== 'probe') return res.status(400).json({ ok: false, error: 'Unknown action' });
  if (!ip) return res.status(422).json({ ok: false, error: 'device_ip is required' });
  const out = await runProbe({ ip, port, timeoutMsRaw });
  return res.status(200).json(out);
});

app.listen(PORT, '0.0.0.0', () => {
  log('agent_started', { port: PORT, token_protected: Boolean(TOKEN) });
});
