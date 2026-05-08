'use strict';

const { calendarDateKeyInZone } = require('./timezone');

/** Rows from UDP 16-byte attendance packets have no verify_state — mark and infer IN/OUT later. */
const INFER_INOUT_KEY = '__zk_infer_inout';

function normZkKey(v) {
  return String(v || '').trim().toUpperCase();
}

function zkPinLookupKeys(card_number) {
  const keys = new Set();
  const b = normZkKey(card_number);
  if (!b) return keys;
  keys.add(b);
  if (/^\d+$/.test(b)) {
    const n = parseInt(b, 10);
    if (Number.isFinite(n)) {
      keys.add(String(n));
      for (let w = 1; w <= 9; w += 1) {
        keys.add(String(n).padStart(w, '0'));
      }
    }
  }
  return keys;
}

function addZkUserKeysToNameMap(map, u) {
  const name = String(u.name || '').trim();
  if (!name) return;
  const ids = [];
  if (u.userId != null && String(u.userId).trim() !== '') ids.push(String(u.userId));
  const cardNum = u.cardno != null ? Number(u.cardno) : 0;
  if (cardNum > 0) ids.push(String(Math.trunc(cardNum)));
  if (u.uid != null) ids.push(String(u.uid));
  for (const id of ids) {
    for (const k of zkPinLookupKeys(id)) {
      map.set(k, name);
    }
  }
}

function buildZkPinToDisplayName(users) {
  const m = new Map();
  for (const u of users || []) addZkUserKeysToNameMap(m, u);
  return m;
}

function lookupZkDisplayName(nameByPin, card_number) {
  if (!nameByPin || !card_number) return '';
  for (const k of zkPinLookupKeys(card_number)) {
    if (nameByPin.has(k)) return nameByPin.get(k);
  }
  return '';
}

function mapZkVerifyStateToEventType(state) {
  const s = Number(state);
  if (!Number.isFinite(s)) return 'CHECK_IN';
  if (s === 0 || s === 3 || s === 4) return 'CHECK_IN';
  if (s === 1 || s === 2 || s === 5) return 'CHECK_OUT';
  return 'CHECK_IN';
}

function extractZkVerifyState(row) {
  if (!row || typeof row !== 'object') return null;
  const candidates = [
    row.state,
    row.verify_state,
    row.verifyState,
    row.in_out,
    row.inOut,
    row.punch,
    row.punch_state,
    row.status,
    row.type,
    row.record_type,
  ];
  for (const v of candidates) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
    const s = String(v ?? '').trim().toLowerCase();
    if (!s) continue;
    if (['in', 'check_in', 'checkin', 'clock in', 'clock-in'].includes(s)) return 0;
    if (['out', 'check_out', 'checkout', 'clock out', 'clock-out'].includes(s)) return 1;
  }
  return null;
}

function parseZkRecordTime(row) {
  const rt = row.record_time;
  if (rt instanceof Date && !Number.isNaN(rt.getTime())) return rt;
  if (typeof rt === 'number' && Number.isFinite(rt)) {
    return new Date(rt < 1e12 ? rt * 1000 : rt);
  }
  return new Date(rt);
}

/**
 * One row from zkteco-js getAttendances → { card_number, event_type, event_time ISO, raw, zk_display_name? }.
 * When the device omits punch direction (common on UDP), event is flagged for alternating IN/OUT per user/day.
 */
function zkAttendanceToPushLog(row, nameByPin = null) {
  if (row == null || typeof row !== 'object') return null;
  const raw = { zk_attendance: { ...row } };
  const u = row.user_id != null ? row.user_id : row.userId;
  let card_number = '';
  if (typeof u === 'string') card_number = String(u).trim();
  else if (typeof u === 'number' && Number.isFinite(u)) card_number = String(Math.trunc(u));
  if (!card_number) return null;

  const event_time = parseZkRecordTime(row);
  if (Number.isNaN(event_time.getTime())) return null;

  const state = extractZkVerifyState(row);
  const hasState = Number.isFinite(state);
  let event_type;
  let needsInfer = false;
  if (hasState) {
    event_type = mapZkVerifyStateToEventType(state);
  } else {
    event_type = 'CHECK_IN';
    needsInfer = true;
  }

  const out = {
    card_number,
    event_type,
    event_time: event_time.toISOString(),
    raw,
  };
  if (needsInfer) {
    out.raw.zk_attendance[INFER_INOUT_KEY] = true;
  }
  const dn = lookupZkDisplayName(nameByPin, card_number);
  if (dn) out.zk_display_name = dn;
  return out;
}

/**
 * For rows without device punch state: VERIFY_ONLY → VERIFY; else alternate CHECK_IN / CHECK_OUT by time per user/day.
 */
function applyAlternatingInOutForInferredLogs(logs, companyTz, deviceMode) {
  if (!Array.isArray(logs) || logs.length === 0) return;

  if (deviceMode === 'VERIFY_ONLY') {
    for (const log of logs) {
      if (log.raw?.zk_attendance?.[INFER_INOUT_KEY]) {
        log.event_type = 'VERIFY';
      }
    }
    return;
  }

  const groups = new Map();
  for (const log of logs) {
    if (!log.raw?.zk_attendance?.[INFER_INOUT_KEY]) continue;
    const card = String(log.card_number || '').trim().toUpperCase();
    const dk = calendarDateKeyInZone(log.event_time, companyTz);
    if (!card || !dk) continue;
    const gk = `${card}|${dk}`;
    if (!groups.has(gk)) groups.set(gk, []);
    groups.get(gk).push(log);
  }

  for (const [, ls] of groups) {
    ls.sort((a, b) => new Date(a.event_time) - new Date(b.event_time));
    ls.forEach((log, i) => {
      log.event_type = i % 2 === 0 ? 'CHECK_IN' : 'CHECK_OUT';
    });
  }
}

module.exports = {
  INFER_INOUT_KEY,
  buildZkPinToDisplayName,
  lookupZkDisplayName,
  zkAttendanceToPushLog,
  applyAlternatingInOutForInferredLogs,
};
