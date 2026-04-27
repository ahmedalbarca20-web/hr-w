'use strict';

/**
 * Iraq / Baghdad–centric calendar helpers (no DST, UTC+3).
 * Use instead of `new Date().toISOString().slice(0, 10)` which is UTC calendar day.
 */

const DEFAULT_IANA = process.env.APP_TIMEZONE || 'Asia/Baghdad';

/**
 * @param {string} [timeZone] IANA zone, e.g. Asia/Baghdad
 * @param {Date} [date]
 * @returns {string} YYYY-MM-DD in that zone
 */
function ymdInTimeZone(timeZone, date = new Date()) {
  const tz = (timeZone && String(timeZone).trim()) || DEFAULT_IANA;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    /* fall through */
  }
  return ymdInTimeZone(DEFAULT_IANA, date);
}

/**
 * Inclusive list of YYYY-MM-DD strings from date_from through date_to (calendar, not wall-clock offset).
 */
function dateRangeInclusiveYmd(fromStr, toStr) {
  const out = [];
  const [fy, fm, fd] = String(fromStr).split('-').map(Number);
  const endKey = String(toStr);
  if (![fy, fm, fd].every(Number.isFinite)) return out;
  let y = fy;
  let m = fm;
  let d = fd;
  for (let guard = 0; guard < 4000; guard += 1) {
    const cur = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    out.push(cur);
    if (cur === endKey) break;
    const nd = new Date(Date.UTC(y, m - 1, d + 1));
    y = nd.getUTCFullYear();
    m = nd.getUTCMonth() + 1;
    d = nd.getUTCDate();
  }
  return out;
}

/** Add whole months to a YYYY-MM-DD (UTC calendar components). */
function addCalendarMonthsYmd(ymd, deltaMonths) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  if (![y, m, d].every(Number.isFinite)) return String(ymd);
  const nd = new Date(Date.UTC(y, m - 1 + Number(deltaMonths), d));
  return nd.toISOString().slice(0, 10);
}

/** Subtract calendar days from a YYYY-MM-DD string. */
function addCalendarDaysYmd(ymd, deltaDays) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  if (![y, m, d].every(Number.isFinite)) return String(ymd);
  const nd = new Date(Date.UTC(y, m - 1, d + Number(deltaDays)));
  return nd.toISOString().slice(0, 10);
}

module.exports = {
  DEFAULT_IANA,
  ymdInTimeZone,
  dateRangeInclusiveYmd,
  addCalendarMonthsYmd,
  addCalendarDaysYmd,
};
