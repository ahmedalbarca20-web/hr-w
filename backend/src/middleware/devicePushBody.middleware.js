'use strict';

/**
 * ZKTeco ADMS / iClock often POSTs attendance as text/plain (tab-separated ATTLOG lines),
 * not JSON. Default express.json leaves req.body empty → push fails.
 * This middleware runs only for device ingest paths, reads the raw body once, and sets req.body.
 */

const PUSH_PATHS = new Set(['/api/devices/push', '/api/iclock/cdata']);

function normalizePath(url) {
  if (!url) return '';
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

function parseJsonSafe(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** Tab/space-separated ATTLOG lines: PIN, DateTime, Status, Verify, ... */
function parseZkAttlogPlainText(s) {
  const lines = s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows = [];
  for (const line of lines) {
    const parts = line.includes('\t') ? line.split('\t') : line.split(/\s+/);
    if (parts.length < 2) continue;

    let pin;
    let dt;
    const c0 = parts[0].trim();
    const c1 = parts[1] ? parts[1].trim() : '';

    if (/^\d{4}[-/]\d{2}[-/]\d{2}/.test(c0)) {
      const datePart = c0.replace(/\//g, '-');
      if (/^\d{2}:\d{2}/.test(c1)) {
        dt = `${datePart} ${c1}`;
        pin = (parts[2] || '').trim();
      } else {
        dt = `${datePart} ${c1}`;
        pin = (parts[2] || c1).trim();
      }
    } else {
      pin = c0;
      dt = c1;
      if (parts.length >= 3 && /^\d{4}[-/]\d{2}[-/]\d{2}/.test(c1)) {
        const datePart = c1.replace(/\//g, '-');
        const timePart = (parts[2] || '').trim();
        dt = `${datePart} ${timePart}`;
        pin = c0;
      }
    }

    if (!pin || !dt) continue;
    rows.push({
      user_id: pin,
      record_time: dt,
      state: parts[2],
      Verify: parts[3],
      raw_line: line,
    });
  }
  return rows.length ? { AttLog: rows, _push_format: 'zk_attlog_text' } : { _iclock_raw: s, _push_format: 'zk_unknown_text' };
}

function mergeQueryIntoBody(query, body) {
  const o = body && typeof body === 'object' && !Array.isArray(body) ? { ...body } : {};
  if (query && typeof query === 'object') {
    for (const [k, v] of Object.entries(query)) {
      if (v != null && o[k] === undefined) o[k] = v;
    }
  }
  return o;
}

function parseBufferToPushBody(req, buf) {
  const ct = String(req.headers['content-type'] || '').toLowerCase();
  const s = buf.length ? buf.toString('utf8') : '';
  const q = req.query || {};

  if (!s) {
    return mergeQueryIntoBody(q, {});
  }

  if (ct.includes('application/json')) {
    const j = parseJsonSafe(s);
    return j && typeof j === 'object' ? mergeQueryIntoBody(q, j) : mergeQueryIntoBody(q, { _raw: s });
  }

  if (ct.includes('application/x-www-form-urlencoded')) {
    const o = {};
    for (const [k, v] of new URLSearchParams(s)) o[k] = v;
    return mergeQueryIntoBody(q, o);
  }

  if (s.includes('=') && !s.includes('\n')) {
    try {
      const o = {};
      for (const [k, v] of new URLSearchParams(s)) o[k] = v;
      if (Object.keys(o).length) return mergeQueryIntoBody(q, o);
    } catch {
      /* fall through */
    }
  }

  return mergeQueryIntoBody(q, parseZkAttlogPlainText(s));
}

/**
 * Express middleware: must be registered BEFORE express.json / urlencoded.
 */
function flexibleDevicePushBody(req, res, next) {
  if (req.method !== 'POST') return next();
  const base = normalizePath(req.originalUrl);
  if (!PUSH_PATHS.has(base)) return next();

  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    req._devicePushBodyParsed = true;
    const buf = Buffer.concat(chunks);
    try {
      req.body = parseBufferToPushBody(req, buf);
    } catch (e) {
      req.body = { _parseError: e.message, _rawLength: buf.length };
    }
    next();
  });
  req.on('error', next);
}

module.exports = {
  flexibleDevicePushBody,
  PUSH_PATHS,
};
