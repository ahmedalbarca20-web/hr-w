'use strict';

/**
 * Attendance Processing Engine
 * ============================
 *
 * Reads raw DeviceLog records, computes daily attendance metrics, and
 * upserts Attendance rows.  The DeviceLog table is NEVER modified
 * except for setting the `processed` flag (the raw_payload and all
 * other columns remain untouched).
 *
 * Computed metrics
 * ────────────────
 *  first_checkin   – stored as Attendance.check_in   (earliest CHECK_IN per day
 *                    that falls in the shift check-in window when configured)
 *  last_checkout   – stored as Attendance.check_out  (latest CHECK_OUT per day
 *                    that falls in the shift check-out window when configured)
 *  total_hours     – virtual field (total_minutes / 60)
 *  late_minutes    – max(0, arrival − shift_start − grace_minutes)
 *  overtime_minutes– max(0, total_minutes − standard_hours×60 − ot_threshold)
 *
 * Shift resolution order
 * ──────────────────────
 *  1. Employee.shift_id → WorkShift (if not null and active)
 *  2. Company default WorkShift (is_default=1, is_active=1)
 *  3. No shift  → late_minutes=0, overtime_minutes=0 (no schedule to compare)
 */

const { Op, literal } = require('sequelize');
const Attendance  = require('../models/attendance.model');
const Employee    = require('../models/employee.model');
const WorkShift   = require('../models/work_shift.model');
const { DeviceLog } = require('../models/device.model');

// ── Tiny error factory ────────────────────────────────────────────────────────

const err = (msg, code = 'VALIDATION_ERROR', status = 400) =>
  Object.assign(new Error(msg), { statusCode: status, code });

/**
 * Same rule as RawLogs: column is_surprise OR nested raw_payload.surprise_attendance.
 * Handles SQLite/MySQL returning 0/1, boolean, or string.
 */
function deviceLogIsSurprise(log) {
  if (!log) return false;
  const col = log.is_surprise;
  if (col === 1 || col === true || col === '1') return true;
  const sa = log.raw_payload && log.raw_payload.surprise_attendance;
  if (!sa) return false;
  return sa.is_surprise === true || sa.is_surprise === 1 || sa.is_surprise === '1';
}

function deviceLogSurpriseEventId(log) {
  if (!log) return null;
  const idCol = log.surprise_event_id;
  if (idCol != null && idCol !== '') return idCol;
  const ev = log.raw_payload?.surprise_attendance?.event_id;
  return ev != null && ev !== '' ? ev : null;
}

// ── Pure calculation helpers (no DB) ─────────────────────────────────────────

/**
 * Parse a MySQL TIME string "HH:MM:SS" → total whole minutes from midnight.
 */
function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h = 0, m = 0] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Build a Date object for a given date (YYYY-MM-DD) and TIME string (HH:MM:SS).
 * Times are interpreted in the local server timezone to match device clocks.
 */
function buildDateAt(dateStr, timeStr) {
  // "YYYY-MM-DDTHH:MM:SS" → parsed locally
  const norm = normalizeTimeStr(timeStr);
  if (!norm) return new Date(NaN);
  const clean = norm.slice(0, 5); // "HH:MM"
  return new Date(`${dateStr}T${clean}:00`);
}

/** Normalize DB TIME (string or Date) to "HH:MM:SS" for window checks. */
function normalizeTimeStr(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return null;
    const m = s.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
    if (!m) return null;
    const h = String(Number(m[1])).padStart(2, '0');
    const mi = String(Number(m[2])).padStart(2, '0');
    const sec = m[3] != null ? String(Number(m[3])).padStart(2, '0') : '00';
    return `${h}:${mi}:${sec}`;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const h = value.getHours();
    const mi = value.getMinutes();
    const sec = value.getSeconds();
    return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return null;
}

function isWithinWindow(eventTime, workDate, startTime, endTime) {
  const startNorm = normalizeTimeStr(startTime);
  const endNorm = normalizeTimeStr(endTime);
  if (!startNorm || !endNorm) return true;
  const at = new Date(eventTime).getTime();
  const start = buildDateAt(workDate, startNorm).getTime();
  const end = buildDateAt(workDate, endNorm).getTime();
  if (![at, start, end].every(Number.isFinite)) return true;
  if (end < start) {
    // Overnight range support.
    return at >= start || at <= end;
  }
  return at >= start && at <= end;
}

/**
 * Filter device punches by optional shift windows, then pick first CHECK_IN and last CHECK_OUT.
 *
 * @param {Array<{ event_type: string, event_time: Date|string }>} effectiveLogs  ascending by time
 * @param {string} workDate "YYYY-MM-DD"
 * @param {object|null} shift WorkShift row or plain object
 * @returns {{ first_checkin: Date|null, last_checkout: Date|null, ignoredOutsideWindows: number }}
 */
function resolveAttendancePunches(effectiveLogs, workDate, shift) {
  const cinStart = shift ? normalizeTimeStr(shift.checkin_window_start) : null;
  const cinEnd = shift ? normalizeTimeStr(shift.checkin_window_end) : null;
  const coutStart = shift ? normalizeTimeStr(shift.checkout_window_start) : null;
  const coutEnd = shift ? normalizeTimeStr(shift.checkout_window_end) : null;
  const checkinWindowOn = Boolean(cinStart && cinEnd);
  const checkoutWindowOn = Boolean(coutStart && coutEnd);
  const scheduleDriven = Boolean(shift);

  let ignoredOutsideWindows = 0;
  const checkIns = [];
  const checkOuts = [];
  const shiftStartTs = shift ? buildDateAt(workDate, shift.shift_start).getTime() : NaN;
  let shiftEndTs = shift ? buildDateAt(workDate, shift.shift_end).getTime() : NaN;
  if (Number.isFinite(shiftStartTs) && Number.isFinite(shiftEndTs) && shiftEndTs < shiftStartTs) {
    shiftEndTs += 24 * 60 * 60 * 1000; // overnight shift
  }
  const shiftMidTs = Number.isFinite(shiftStartTs) && Number.isFinite(shiftEndTs)
    ? shiftStartTs + Math.floor((shiftEndTs - shiftStartTs) / 2)
    : NaN;

  for (const log of effectiveLogs) {
    const type = (log.event_type || '').toUpperCase();
    if (scheduleDriven) {
      const inCin = checkinWindowOn && isWithinWindow(log.event_time, workDate, cinStart, cinEnd);
      const inCout = checkoutWindowOn && isWithinWindow(log.event_time, workDate, coutStart, coutEnd);

      if (inCin && !inCout) {
        checkIns.push(log);
        continue;
      }
      if (!inCin && inCout) {
        checkOuts.push(log);
        continue;
      }

      if (inCin && inCout) {
        const ts = new Date(log.event_time).getTime();
        if (Number.isFinite(shiftMidTs) && ts > shiftMidTs) checkOuts.push(log);
        else checkIns.push(log);
        continue;
      }

      // If outside configured windows, still classify by shift timeline (not by device state).
      const ts = new Date(log.event_time).getTime();
      if (Number.isFinite(shiftMidTs) && ts > shiftMidTs) checkOuts.push(log);
      else if (Number.isFinite(ts)) checkIns.push(log);
      else ignoredOutsideWindows += 1;
      continue;
    }

    // No shift configured: minimal heuristic without trusting device state.
    const ts = new Date(log.event_time).getTime();
    if (Number.isFinite(ts)) checkIns.push(log);
  }

  const first_checkin = checkIns.length ? new Date(checkIns[0].event_time) : null;
  let last_checkout = checkOuts.length ? new Date(checkOuts[checkOuts.length - 1].event_time) : null;
  if (!last_checkout && effectiveLogs.length > 1) {
    last_checkout = new Date(effectiveLogs[effectiveLogs.length - 1].event_time);
  }

  return { first_checkin, last_checkout, ignoredOutsideWindows };
}

/**
 * Core pure function — calculate attendance metrics given raw inputs.
 * No DB access.
 *
 * @param {Date|null} firstCheckin
 * @param {Date|null} lastCheckout
 * @param {string}    workDate     "YYYY-MM-DD"
 * @param {object|null} shift      WorkShift instance or plain object
 * @returns {{ late_minutes, overtime_minutes, total_minutes, status }}
 */
function computeMetrics(firstCheckin, lastCheckout, workDate, shift) {
  // ── total_minutes ────────────────────────────────────────────────────────
  let total_minutes = null;
  if (firstCheckin && lastCheckout && lastCheckout > firstCheckin) {
    total_minutes = Math.round((lastCheckout - firstCheckin) / 60000);
  }

  // ── late_minutes ─────────────────────────────────────────────────────────
  let late_minutes = 0;
  if (firstCheckin && shift) {
    const shiftStartDt = buildDateAt(workDate, shift.shift_start);
    const rawLate      = Math.round((firstCheckin - shiftStartDt) / 60000);
    const grace        = Number(shift.grace_minutes) || 0;
    late_minutes       = Math.max(0, rawLate - grace);
  }

  // ── overtime_minutes ──────────────────────────────────────────────────────
  let overtime_minutes = 0;
  if (total_minutes !== null && shift) {
    const standardMins  = Math.round(parseFloat(shift.standard_hours) * 60);
    const threshold     = Number(shift.overtime_threshold_minutes) || 0;
    overtime_minutes    = Math.max(0, total_minutes - standardMins - threshold);
  }

  // ── status ────────────────────────────────────────────────────────────────
  let status = 'ABSENT';
  if (firstCheckin) {
    const standardMins = shift ? Math.round(parseFloat(shift.standard_hours) * 60) : 480;
    if (total_minutes !== null && total_minutes < standardMins / 2) {
      status = 'HALF_DAY';
    } else if (late_minutes > 0) {
      status = 'LATE';
    } else {
      status = 'PRESENT';
    }
  }

  return { late_minutes, overtime_minutes, total_minutes, status };
}

/**
 * Remove repeated punches of the same type within a short time window.
 * Keeps the first punch and ignores immediate repeats.
 *
 * @param {Array<{ id:number, event_type:string, event_time:Date|string }>} logs
 * @param {number} windowSeconds
 * @returns {{ filtered: Array, ignoredCount: number }}
 */
function dedupeRapidPunches(logs, windowSeconds = 60) {
  const filtered = [];
  let lastPunchTs = null;
  let ignoredCount = 0;

  for (const log of logs) {
    const ts = new Date(log.event_time).getTime();
    if (lastPunchTs != null && Number.isFinite(ts) && (ts - lastPunchTs) >= 0 && (ts - lastPunchTs) <= windowSeconds * 1000) {
      ignoredCount += 1;
      continue;
    }
    filtered.push(log);
    lastPunchTs = ts;
  }

  return { filtered, ignoredCount };
}

// ── Shift resolution ──────────────────────────────────────────────────────────

async function resolveShift(employee_id, company_id) {
  // 1. Employee-specific shift
  const emp = await Employee.unscoped().findOne({
    where     : { id: employee_id },
    attributes: ['shift_id'],
  });
  if (emp && emp.shift_id) {
    const s = await WorkShift.findOne({
      where: { id: emp.shift_id, company_id, is_active: 1 },
    });
    if (s) return s;
  }

  // 2. Company default shift
  return WorkShift.findOne({
    where: { company_id, is_default: 1, is_active: 1 },
  });
}

// ── Core: process one employee × one work_date ───────────────────────────────

/**
 * @param {number}  company_id
 * @param {number}  employee_id
 * @param {string}  work_date    "YYYY-MM-DD"
 * @param {object}  opts
 * @param {boolean} opts.overwrite  Replace existing DEVICE-sourced records (default false)
 * @returns {object}  Result summary
 */
async function processEmployeeDate(company_id, employee_id, work_date, { overwrite = false } = {}) {
  // Guard: employee belongs to this company
  const emp = await Employee.unscoped().findOne({ where: { id: employee_id, company_id } });
  if (!emp) throw err(`Employee ${employee_id} not found in this company`);

  // Existing attendance record (if any)
  const existing = await Attendance.findOne({
    where: { company_id, employee_id, work_date },
  });

  // Protect manually entered records unless caller explicitly requests overwrite
  if (existing && existing.source !== 'DEVICE' && !overwrite) {
    return {
      skipped    : true,
      reason     : 'Manual attendance record exists; set overwrite=true to replace',
      employee_id,
      work_date,
    };
  }

  // Fetch attendance-eligible device logs for this employee/date
  // ────────────────────────────────────────────────────────────────────────
  // IMPORTANT: DeviceLog table is READ-ONLY here except for the processed flag.
  // raw_payload and all other columns are never touched.
  const logs = await DeviceLog.findAll({
    where: {
      company_id,
      employee_id,
      is_duplicate  : 0,
      is_verify_only: 0,
      [Op.and]: [literal(`DATE(event_time) = '${work_date}'`)],
    },
    order     : [['event_time', 'ASC']],
    attributes: ['id', 'event_type', 'event_time', 'is_surprise', 'surprise_event_id', 'raw_payload'],
  });

  const { filtered: effectiveLogs, ignoredCount } = dedupeRapidPunches(logs, 60);

  const shift = await resolveShift(employee_id, company_id);

  const surpriseLogs = logs.filter(deviceLogIsSurprise);
  const hasSurprise = surpriseLogs.length > 0;
  const surpriseEventId = surpriseLogs.map(deviceLogSurpriseEventId).find((id) => id != null) ?? null;
  const mergedIsSurprise = hasSurprise || Number(existing?.is_surprise) === 1;
  // During surprise attendance windows, do not let those punches affect normal schedule-based in/out.
  const normalLogs = effectiveLogs.filter((l) => !deviceLogIsSurprise(l));
  const { first_checkin, last_checkout, ignoredOutsideWindows } =
    resolveAttendancePunches(normalLogs, work_date, shift);

  // Incremental pulls may contain only one side (just check-in or just check-out).
  // Keep the existing opposite side to avoid wiping already computed attendance.
  const merged_check_in = first_checkin || existing?.check_in || null;
  const merged_check_out = last_checkout || existing?.check_out || null;

  // Compute all metrics (pure function — no DB)
  const { late_minutes, overtime_minutes, total_minutes, status } =
    computeMetrics(merged_check_in, merged_check_out, work_date, shift);

  // Upsert attendance record
  const payload = {
    company_id,
    employee_id,
    work_date,
    check_in        : merged_check_in,
    check_out       : merged_check_out,
    total_minutes,
    late_minutes,
    overtime_minutes,
    status,
    is_surprise     : mergedIsSurprise ? 1 : 0,
    surprise_event_id: surpriseEventId || existing?.surprise_event_id || null,
    source          : 'DEVICE',
  };

  let record;
  if (existing) {
    await existing.update(payload);
    record = await existing.reload();
  } else {
    record = await Attendance.create(payload);
  }

  // Mark the consumed logs as processed=1 (ONLY flag — nothing else changes)
  if (logs.length > 0) {
    await DeviceLog.update(
      { processed: 1 },
      { where: { id: { [Op.in]: logs.map(l => l.id) } } }
    );
  }

  return {
    employee_id,
    work_date,
    shift_used      : shift ? { id: shift.id, name: shift.name } : null,
    record: {
      id              : record.id,
      status          : record.status,
      first_checkin   : record.check_in,
      last_checkout   : record.check_out,
      total_minutes   : record.total_minutes,
      total_hours     : record.total_hours,
      late_minutes    : record.late_minutes,
      overtime_minutes: record.overtime_minutes,
      is_surprise     : record.is_surprise,
      surprise_event_id: record.surprise_event_id,
    },
    logs_consumed: logs.length,
    ignored_duplicate_punches: ignoredCount,
    ignored_outside_windows: ignoredOutsideWindows,
  };
}

// ── Bulk: all employees with logs on a given date ─────────────────────────────

/**
 * Processes every employee that has unprocessed device logs on work_date.
 *
 * @param {number}  company_id
 * @param {string}  work_date   "YYYY-MM-DD"
 * @param {object}  opts
 * @param {boolean} opts.overwrite
 * @param {boolean} opts.dry_run   Preview without writing anything
 */
async function processBulk(company_id, work_date, { overwrite = false, dry_run = false } = {}) {
  // Discover all employees with qualifying logs on this date
  const rawRows = await DeviceLog.findAll({
    where: {
      company_id,
      is_duplicate  : 0,
      is_verify_only: 0,
      [Op.and]: [literal(`DATE(event_time) = '${work_date}'`)],
    },
    attributes: ['employee_id'],
    group: ['employee_id'],
    raw  : true,
  });

  const employeeIds = rawRows.map(r => r.employee_id).filter(Boolean);

  if (dry_run) {
    return {
      dry_run     : true,
      work_date,
      employees_to_process: employeeIds.length,
      employee_ids: employeeIds,
    };
  }

  const results = { processed: [], skipped: [], errors: [] };

  for (const employee_id of employeeIds) {
    try {
      const res = await processEmployeeDate(company_id, employee_id, work_date, { overwrite });
      if (res.skipped) {
        results.skipped.push({ employee_id, reason: res.reason });
      } else {
        results.processed.push(res);
      }
    } catch (e) {
      results.errors.push({ employee_id, error: e.message });
    }
  }

  results.summary = {
    work_date,
    total    : employeeIds.length,
    processed: results.processed.length,
    skipped  : results.skipped.length,
    errors   : results.errors.length,
  };

  return results;
}

// ── Reprocess: reset processed flag, then re-run ──────────────────────────────

/**
 * Resets the `processed` flag on qualifying device logs, then re-runs the
 * engine.  The raw_payload and all other DeviceLog columns remain unchanged.
 *
 * Pass employee_id to reprocess a single employee; omit for the whole day.
 *
 * @param {number}       company_id
 * @param {string}       work_date     "YYYY-MM-DD"
 * @param {number|null}  employee_id
 */
async function reprocess(company_id, work_date, employee_id = null) {
  const logWhere = {
    company_id,
    is_duplicate  : 0,
    is_verify_only: 0,
    [Op.and]: [literal(`DATE(event_time) = '${work_date}'`)],
  };
  if (employee_id) logWhere.employee_id = employee_id;

  // Only the processed flag is reset — raw data is untouched
  await DeviceLog.update({ processed: 0 }, { where: logWhere });

  return employee_id
    ? processEmployeeDate(company_id, employee_id, work_date, { overwrite: true })
    : processBulk(company_id, work_date, { overwrite: true });
}

// ── Shift CRUD ────────────────────────────────────────────────────────────────

async function listShifts(company_id, { include_inactive = false } = {}) {
  const where = { company_id };
  if (!include_inactive) where.is_active = 1;
  return WorkShift.findAll({ where, order: [['is_default', 'DESC'], ['name', 'ASC']] });
}

async function createShift(company_id, data) {
  // Auto-make default when it's the company's first shift
  const count = await WorkShift.count({ where: { company_id } });
  const payload = { ...data, company_id };
  if (count === 0) payload.is_default = 1;
  return WorkShift.create(payload);
}

async function getShift(id, company_id) {
  const shift = await WorkShift.findOne({ where: { id, company_id } });
  if (!shift) throw err('Work shift not found', 'NOT_FOUND', 404);
  return shift;
}

async function updateShift(id, company_id, data) {
  const shift = await getShift(id, company_id);
  // Disallow changing is_default via update — use setDefaultShift for that
  const { is_default: _ignored, ...safe } = data;
  return shift.update(safe);
}

async function deactivateShift(id, company_id) {
  const shift = await getShift(id, company_id);
  if (shift.is_default) {
    throw err('Cannot deactivate the default shift; set another shift as default first');
  }
  return shift.update({ is_active: 0 });
}

async function setDefaultShift(id, company_id) {
  const shift = await getShift(id, company_id);
  if (!shift.is_active) throw err('Cannot make an inactive shift the default');
  // Unset previous default
  await WorkShift.update({ is_default: 0 }, { where: { company_id } });
  return shift.update({ is_default: 1 });
}

module.exports = {
  // Engine
  processEmployeeDate,
  processBulk,
  reprocess,
  // Pure helpers (exported for testing)
  computeMetrics,
  timeToMinutes,
  dedupeRapidPunches,
  resolveAttendancePunches,
  isWithinWindow,
  normalizeTimeStr,
  // Shift management
  listShifts,
  createShift,
  getShift,
  updateShift,
  deactivateShift,
  setDefaultShift,
};
