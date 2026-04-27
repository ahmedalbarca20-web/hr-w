'use strict';

const request = require('supertest');
const app     = require('../src/app');

// ── Pure computation helpers (exported from service) ──────────────────────────
const {
  computeMetrics,
  timeToMinutes,
  resolveAttendancePunches,
  isWithinWindow,
  normalizeTimeStr,
} = require('../src/services/attendance_processor.service');

// ── Zod schemas ───────────────────────────────────────────────────────────────
const {
  workShiftCreateSchema,
  workShiftUpdateSchema,
  workShiftListSchema,
  processBulkSchema,
  processEmployeeSchema,
  reprocessSchema,
} = require('../src/utils/validators');

// ─────────────────────────────────────────────────────────────────────────────
// 1.  Auth guards — /api/process
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/process – auth guards', () => {
  it('returns 401 without JWT (bulk)', async () => {
    const res = await request(app).post('/api/process').send({ date: '2025-01-15' });
    expect(res.status).toBe(401);
  });

  it('returns 401 without JWT (single employee)', async () => {
    const res = await request(app)
      .post('/api/process/employee/1')
      .send({ date: '2025-01-15' });
    expect(res.status).toBe(401);
  });

  it('returns 401 without JWT (reprocess)', async () => {
    const res = await request(app)
      .post('/api/process/reprocess')
      .send({ date: '2025-01-15' });
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2.  Auth guards — /api/shifts
// ─────────────────────────────────────────────────────────────────────────────

describe('Shift routes – auth guards', () => {
  it('GET /api/shifts → 401 without JWT', async () => {
    const res = await request(app).get('/api/shifts');
    expect(res.status).toBe(401);
  });

  it('POST /api/shifts → 401 without JWT', async () => {
    const res = await request(app).post('/api/shifts').send({});
    expect(res.status).toBe(401);
  });

  it('GET /api/shifts/:id → 401 without JWT', async () => {
    const res = await request(app).get('/api/shifts/1');
    expect(res.status).toBe(401);
  });

  it('PUT /api/shifts/:id → 401 without JWT', async () => {
    const res = await request(app).put('/api/shifts/1').send({});
    expect(res.status).toBe(401);
  });

  it('DELETE /api/shifts/:id → 401 without JWT', async () => {
    const res = await request(app).delete('/api/shifts/1');
    expect(res.status).toBe(401);
  });

  it('POST /api/shifts/:id/set-default → 401 without JWT', async () => {
    const res = await request(app).post('/api/shifts/1/set-default');
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3.  timeToMinutes helper
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeTimeStr()', () => {
  it('normalizes string times', () => {
    expect(normalizeTimeStr('8:5:0')).toBe('08:05:00');
    expect(normalizeTimeStr('17:30:00')).toBe('17:30:00');
  });
});

describe('isWithinWindow()', () => {
  const wd = '2025-01-15';
  it('returns true when start/end missing', () => {
    expect(isWithinWindow(new Date(`${wd}T12:00:00`), wd, null, '17:00:00')).toBe(true);
  });
  it('detects inside same-day window', () => {
    expect(isWithinWindow(new Date(`${wd}T08:30:00`), wd, '08:00:00', '10:00:00')).toBe(true);
    expect(isWithinWindow(new Date(`${wd}T07:30:00`), wd, '08:00:00', '10:00:00')).toBe(false);
  });
});

describe('resolveAttendancePunches()', () => {
  const wd = '2025-01-15';
  const shift = {
    shift_start: '08:00:00',
    shift_end: '17:00:00',
    checkin_window_start: '06:00:00',
    checkin_window_end: '10:00:00',
    checkout_window_start: '15:00:00',
    checkout_window_end: '20:00:00',
    standard_hours: 8,
    grace_minutes: 0,
    overtime_threshold_minutes: 0,
  };

  it('uses first CHECK_IN and last CHECK_OUT (not first/last row blindly)', () => {
    const logs = [
      { event_type: 'CHECK_OUT', event_time: new Date(`${wd}T06:00:00`) },
      { event_type: 'CHECK_IN', event_time: new Date(`${wd}T08:00:00`) },
      { event_type: 'CHECK_OUT', event_time: new Date(`${wd}T17:00:00`) },
    ];
    const r = resolveAttendancePunches(logs, wd, null);
    expect(localHHMM(r.first_checkin)).toBe('08:00');
    expect(localHHMM(r.last_checkout)).toBe('17:00');
    expect(r.ignoredOutsideWindows).toBe(0);
  });

  it('ignores punches outside configured windows', () => {
    const logs = [
      { event_type: 'CHECK_IN', event_time: new Date(`${wd}T05:00:00`) },
      { event_type: 'CHECK_IN', event_time: new Date(`${wd}T08:00:00`) },
      { event_type: 'CHECK_OUT', event_time: new Date(`${wd}T12:00:00`) },
      { event_type: 'CHECK_OUT', event_time: new Date(`${wd}T17:00:00`) },
    ];
    const r = resolveAttendancePunches(logs, wd, shift);
    expect(localHHMM(r.first_checkin)).toBe('08:00');
    expect(localHHMM(r.last_checkout)).toBe('17:00');
    expect(r.ignoredOutsideWindows).toBe(2);
  });
});

describe('timeToMinutes()', () => {
  it('converts "08:00:00" → 480', () => expect(timeToMinutes('08:00:00')).toBe(480));
  it('converts "08:00"    → 480', () => expect(timeToMinutes('08:00')).toBe(480));
  it('converts "00:00:00" → 0',   () => expect(timeToMinutes('00:00:00')).toBe(0));
  it('converts "17:30:00" → 1050',() => expect(timeToMinutes('17:30:00')).toBe(1050));
  it('converts "23:59:00" → 1439',() => expect(timeToMinutes('23:59:00')).toBe(1439));
  it('returns 0 for null/undefined', () => expect(timeToMinutes(null)).toBe(0));
});

// ─────────────────────────────────────────────────────────────────────────────
// 4.  computeMetrics() – pure function, no DB
// ─────────────────────────────────────────────────────────────────────────────

const WORK_DATE = '2025-01-15';

// Build a Date for workDate at a given HH:MM
const at = (hhmm) => new Date(`${WORK_DATE}T${hhmm}:00`);

const localHHMM = (d) => {
  if (!d) return null;
  const x = new Date(d);
  return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
};

// Standard 8-hour shift, 08:00–17:00, 10 min grace, 30 min OT threshold
const standardShift = {
  shift_start               : '08:00:00',
  shift_end                 : '17:00:00',
  standard_hours            : 8,
  grace_minutes             : 10,
  overtime_threshold_minutes: 30,
};

describe('computeMetrics() – no logs (absent)', () => {
  it('sets status ABSENT when no first_checkin', () => {
    const { status, late_minutes, total_minutes, overtime_minutes } =
      computeMetrics(null, null, WORK_DATE, standardShift);
    expect(status).toBe('ABSENT');
    expect(late_minutes).toBe(0);
    expect(total_minutes).toBeNull();
    expect(overtime_minutes).toBe(0);
  });
});

describe('computeMetrics() – check-in only (no checkout)', () => {
  it('PRESENT when on time and no checkout', () => {
    const { status, late_minutes, total_minutes } =
      computeMetrics(at('08:00'), null, WORK_DATE, standardShift);
    expect(status).toBe('PRESENT');
    expect(late_minutes).toBe(0);
    expect(total_minutes).toBeNull();
  });

  it('LATE when arrived after grace period', () => {
    // arrived 08:15 → 15 min late, grace 10 → net late 5
    const { status, late_minutes } =
      computeMetrics(at('08:15'), null, WORK_DATE, standardShift);
    expect(status).toBe('LATE');
    expect(late_minutes).toBe(5);
  });

  it('PRESENT when within grace period (8 min late, 10 min grace)', () => {
    const { status, late_minutes } =
      computeMetrics(at('08:08'), null, WORK_DATE, standardShift);
    expect(status).toBe('PRESENT');
    expect(late_minutes).toBe(0);
  });

  it('PRESENT when exactly at shift_start', () => {
    const { status, late_minutes } =
      computeMetrics(at('08:00'), null, WORK_DATE, standardShift);
    expect(status).toBe('PRESENT');
    expect(late_minutes).toBe(0);
  });

  it('PRESENT when exactly at grace boundary (10 min late, 10 min grace)', () => {
    const { status, late_minutes } =
      computeMetrics(at('08:10'), null, WORK_DATE, standardShift);
    expect(status).toBe('PRESENT');
    expect(late_minutes).toBe(0);
  });
});

describe('computeMetrics() – standard present day (check in + out)', () => {
  it('PRESENT — exact 8h shift, no late, no OT', () => {
    // 08:00 → 16:00 = 480 min; standard=8h=480; OT threshold=30 → OT=max(0,480-480-30)=0
    const { status, late_minutes, total_minutes, overtime_minutes } =
      computeMetrics(at('08:00'), at('16:00'), WORK_DATE, standardShift);
    expect(status).toBe('PRESENT');
    expect(late_minutes).toBe(0);
    expect(total_minutes).toBe(480);
    expect(overtime_minutes).toBe(0);
  });

  it('total_minutes calculated correctly', () => {
    // 09:00 → 17:00 = 480 min
    const { total_minutes } =
      computeMetrics(at('09:00'), at('17:00'), WORK_DATE, standardShift);
    expect(total_minutes).toBe(480);
  });

  it('LATE — arrived 20 min late, grace 10 → late_minutes = 10', () => {
    const { status, late_minutes } =
      computeMetrics(at('08:20'), at('17:00'), WORK_DATE, standardShift);
    expect(status).toBe('LATE');
    expect(late_minutes).toBe(10);
  });
});

describe('computeMetrics() – overtime', () => {
  it('overtime_minutes zero when within threshold (worked 490 min, std 480, threshold 30)', () => {
    // 08:00 → 16:10 = 490 min; OT = max(0, 490 - 480 - 30) = 0
    const { overtime_minutes } =
      computeMetrics(at('08:00'), at('16:10'), WORK_DATE, standardShift);
    expect(overtime_minutes).toBe(0);
  });

  it('overtime_minutes counted after threshold', () => {
    // 08:00 → 17:30 = 570 min; OT = max(0, 570 - 480 - 30) = 60
    const { overtime_minutes } =
      computeMetrics(at('08:00'), at('17:30'), WORK_DATE, standardShift);
    expect(overtime_minutes).toBe(60);
  });

  it('overtime is 0 when total_minutes is null (no checkout)', () => {
    const { overtime_minutes } =
      computeMetrics(at('08:00'), null, WORK_DATE, standardShift);
    expect(overtime_minutes).toBe(0);
  });
});

describe('computeMetrics() – HALF_DAY', () => {
  it('HALF_DAY when total work is less than half of standard_hours', () => {
    // standard=480 min; worked 08:00→11:00=180 min < 240 min
    const { status } =
      computeMetrics(at('08:00'), at('11:00'), WORK_DATE, standardShift);
    expect(status).toBe('HALF_DAY');
  });

  it('PRESENT when exactly at half threshold', () => {
    // worked exactly 240 min (half of 480) → NOT half_day
    const { status } =
      computeMetrics(at('08:00'), at('12:00'), WORK_DATE, standardShift);
    expect(status).not.toBe('HALF_DAY');
  });
});

describe('computeMetrics() – no shift provided', () => {
  it('late_minutes is 0 when no shift configured', () => {
    const { late_minutes } =
      computeMetrics(at('09:00'), at('17:00'), WORK_DATE, null);
    expect(late_minutes).toBe(0);
  });

  it('overtime_minutes is 0 when no shift configured', () => {
    const { overtime_minutes } =
      computeMetrics(at('08:00'), at('20:00'), WORK_DATE, null);
    expect(overtime_minutes).toBe(0);
  });

  it('status is PRESENT when checked in with no shift', () => {
    const { status } =
      computeMetrics(at('08:00'), at('16:00'), WORK_DATE, null);
    expect(status).toBe('PRESENT');
  });

  it('status is ABSENT when no checkin regardless of shift', () => {
    const { status } = computeMetrics(null, at('16:00'), WORK_DATE, null);
    expect(status).toBe('ABSENT');
  });
});

describe('computeMetrics() – checkout before checkin', () => {
  it('total_minutes is null when checkout <= checkin', () => {
    const { total_minutes } =
      computeMetrics(at('10:00'), at('09:00'), WORK_DATE, standardShift);
    expect(total_minutes).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5.  workShiftCreateSchema
// ─────────────────────────────────────────────────────────────────────────────

describe('workShiftCreateSchema', () => {
  const validShift = {
    name       : 'Morning Shift',
    shift_start: '08:00',
    shift_end  : '17:00',
  };

  it('accepts valid minimal payload', () => {
    const r = workShiftCreateSchema.safeParse(validShift);
    expect(r.success).toBe(true);
  });

  it('accepts full payload with all fields', () => {
    const r = workShiftCreateSchema.safeParse({
      ...validShift,
      name_ar                   : 'وردية صباحية',
      standard_hours            : 8,
      grace_minutes             : 10,
      overtime_threshold_minutes: 30,
      is_active                 : 1,
    });
    expect(r.success).toBe(true);
  });

  it('rejects missing name', () => {
    const { name: _n, ...rest } = validShift;
    expect(workShiftCreateSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects missing shift_start', () => {
    const { shift_start: _s, ...rest } = validShift;
    expect(workShiftCreateSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects missing shift_end', () => {
    const { shift_end: _e, ...rest } = validShift;
    expect(workShiftCreateSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects invalid time format for shift_start', () => {
    const r = workShiftCreateSchema.safeParse({ ...validShift, shift_start: '8am' });
    expect(r.success).toBe(false);
  });

  it('rejects invalid time format for shift_end', () => {
    const r = workShiftCreateSchema.safeParse({ ...validShift, shift_end: '25:00' });
    expect(r.success).toBe(false);
  });

  it('accepts HH:MM:SS format for times', () => {
    const r = workShiftCreateSchema.safeParse({
      ...validShift,
      shift_start: '08:00:00',
      shift_end  : '17:00:00',
    });
    expect(r.success).toBe(true);
  });

  it('applies default standard_hours = 8', () => {
    const r = workShiftCreateSchema.safeParse(validShift);
    expect(r.success).toBe(true);
    expect(r.data.standard_hours).toBe(8);
  });

  it('applies default grace_minutes = 0', () => {
    const r = workShiftCreateSchema.safeParse(validShift);
    expect(r.success).toBe(true);
    expect(r.data.grace_minutes).toBe(0);
  });

  it('rejects standard_hours < 0.5', () => {
    const r = workShiftCreateSchema.safeParse({ ...validShift, standard_hours: 0.4 });
    expect(r.success).toBe(false);
  });

  it('rejects grace_minutes > 120', () => {
    const r = workShiftCreateSchema.safeParse({ ...validShift, grace_minutes: 121 });
    expect(r.success).toBe(false);
  });
});

describe('workShiftUpdateSchema', () => {
  it('accepts empty object (all optional)', () => {
    expect(workShiftUpdateSchema.safeParse({}).success).toBe(true);
  });

  it('accepts partial update', () => {
    const r = workShiftUpdateSchema.safeParse({ grace_minutes: 15 });
    expect(r.success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6.  processBulkSchema
// ─────────────────────────────────────────────────────────────────────────────

describe('processBulkSchema', () => {
  it('accepts valid date_from', () => {
    const r = processBulkSchema.safeParse({ date_from: '2026-01-15' });
    expect(r.success).toBe(true);
    expect(r.data.date_to).toBe('2026-01-15');
  });

  it('rejects missing date_from', () => {
    expect(processBulkSchema.safeParse({}).success).toBe(false);
  });

  it('rejects invalid date format', () => {
    expect(processBulkSchema.safeParse({ date_from: '15-01-2026' }).success).toBe(false);
  });

  it('defaults overwrite to false', () => {
    const r = processBulkSchema.safeParse({ date_from: '2026-01-15' });
    expect(r.success).toBe(true);
    expect(r.data.overwrite).toBe(false);
  });

  it('defaults dry_run to false', () => {
    const r = processBulkSchema.safeParse({ date_from: '2026-01-15' });
    expect(r.success).toBe(true);
    expect(r.data.dry_run).toBe(false);
  });

  it('accepts overwrite=true', () => {
    const r = processBulkSchema.safeParse({ date_from: '2026-01-15', overwrite: true });
    expect(r.success).toBe(true);
    expect(r.data.overwrite).toBe(true);
  });

  it('accepts dry_run=true', () => {
    const r = processBulkSchema.safeParse({ date_from: '2026-01-15', dry_run: true });
    expect(r.success).toBe(true);
    expect(r.data.dry_run).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7.  processEmployeeSchema
// ─────────────────────────────────────────────────────────────────────────────

describe('processEmployeeSchema', () => {
  it('accepts valid payload', () => {
    const r = processEmployeeSchema.safeParse({ employee_id: '5', date_from: '2026-01-15' });
    expect(r.success).toBe(true);
    expect(r.data.employee_id).toBe(5);
  });

  it('rejects missing date_from', () => {
    expect(processEmployeeSchema.safeParse({ employee_id: '5' }).success).toBe(false);
  });

  it('rejects missing employee_id', () => {
    expect(processEmployeeSchema.safeParse({ date_from: '2026-01-15' }).success).toBe(false);
  });

  it('rejects negative employee_id', () => {
    expect(processEmployeeSchema.safeParse({ employee_id: '-1', date_from: '2026-01-15' }).success).toBe(false);
  });

  it('coerces string employee_id to number', () => {
    const r = processEmployeeSchema.safeParse({ employee_id: '42', date_from: '2026-01-15' });
    expect(r.success).toBe(true);
    expect(r.data.employee_id).toBe(42);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8.  reprocessSchema
// ─────────────────────────────────────────────────────────────────────────────

describe('reprocessSchema', () => {
  it('accepts date_from only (bulk reprocess)', () => {
    const r = reprocessSchema.safeParse({ date_from: '2026-01-15' });
    expect(r.success).toBe(true);
    expect(r.data.employee_id).toBeUndefined();
  });

  it('accepts date_from + employee_id (single reprocess)', () => {
    const r = reprocessSchema.safeParse({ date_from: '2026-01-15', employee_id: 7 });
    expect(r.success).toBe(true);
    expect(r.data.employee_id).toBe(7);
  });

  it('rejects missing date_from', () => {
    expect(reprocessSchema.safeParse({ employee_id: 1 }).success).toBe(false);
  });

  it('rejects invalid date', () => {
    expect(reprocessSchema.safeParse({ date_from: 'not-a-date' }).success).toBe(false);
  });

  it('rejects negative employee_id', () => {
    expect(reprocessSchema.safeParse({ date_from: '2026-01-15', employee_id: -5 }).success).toBe(false);
  });
});
