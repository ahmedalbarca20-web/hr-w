'use strict';

/**
 * Payroll + Attendance + Leave module tests (no live DB required).
 * Integration tests marked .skip need a seeded DB.
 */

const request = require('supertest');
const app     = require('../src/app');

const fakeBearer = (token) => ({ Authorization: `Bearer ${token}` });

// ── Attendance route guards ───────────────────────────────────────────────────

describe('Attendance routes — unauthenticated', () => {
  it('GET  /api/attendance → 401',             async () => {
    const res = await request(app).get('/api/attendance');
    expect(res.statusCode).toBe(401);
  });
  it('POST /api/attendance/checkin → 401',     async () => {
    const res = await request(app).post('/api/attendance/checkin');
    expect(res.statusCode).toBe(401);
  });
  it('POST /api/attendance/checkout → 401',    async () => {
    const res = await request(app).post('/api/attendance/checkout');
    expect(res.statusCode).toBe(401);
  });
  it('GET  /api/attendance/summary → 401',     async () => {
    const res = await request(app).get('/api/attendance/summary');
    expect(res.statusCode).toBe(401);
  });
});

// ── Leave route guards ────────────────────────────────────────────────────────

describe('Leave routes — unauthenticated', () => {
  it('GET  /api/leaves/types → 401',           async () => {
    const res = await request(app).get('/api/leaves/types');
    expect(res.statusCode).toBe(401);
  });
  it('GET  /api/leaves/balances → 401',        async () => {
    const res = await request(app).get('/api/leaves/balances');
    expect(res.statusCode).toBe(401);
  });
  it('GET  /api/leaves/requests → 401',        async () => {
    const res = await request(app).get('/api/leaves/requests');
    expect(res.statusCode).toBe(401);
  });
  it('POST /api/leaves/requests → 401',        async () => {
    const res = await request(app).post('/api/leaves/requests').send({});
    expect(res.statusCode).toBe(401);
  });
});

// ── Payroll route guards ──────────────────────────────────────────────────────

describe('Payroll routes — unauthenticated', () => {
  it('GET  /api/payroll/components → 401',     async () => {
    const res = await request(app).get('/api/payroll/components');
    expect(res.statusCode).toBe(401);
  });
  it('GET  /api/payroll/runs → 401',           async () => {
    const res = await request(app).get('/api/payroll/runs');
    expect(res.statusCode).toBe(401);
  });
  it('POST /api/payroll/runs → 401',           async () => {
    const res = await request(app).post('/api/payroll/runs').send({});
    expect(res.statusCode).toBe(401);
  });
});

// ── User / Announcement route guards ─────────────────────────────────────────

describe('User + Announcement routes — unauthenticated', () => {
  it('GET  /api/users → 401',               async () => {
    const res = await request(app).get('/api/users');
    expect(res.statusCode).toBe(401);
  });
  it('GET  /api/announcements → 401',       async () => {
    const res = await request(app).get('/api/announcements');
    expect(res.statusCode).toBe(401);
  });
  it('POST /api/announcements → 401',       async () => {
    const res = await request(app).post('/api/announcements').send({});
    expect(res.statusCode).toBe(401);
  });
});

// ── Invalid token across new routes ──────────────────────────────────────────

describe('New routes — invalid token', () => {
  it('GET /api/attendance with bad token → 401 TOKEN_INVALID', async () => {
    const res = await request(app)
      .get('/api/attendance')
      .set(fakeBearer('bad.token.here'));
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('TOKEN_INVALID');
  });

  it('GET /api/payroll/runs with bad token → 401 TOKEN_INVALID', async () => {
    const res = await request(app)
      .get('/api/payroll/runs')
      .set(fakeBearer('bad.token.here'));
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('TOKEN_INVALID');
  });
});

// ── Zod validator unit tests ──────────────────────────────────────────────────

describe('Payroll Zod validators (unit)', () => {
  const {
    salaryComponentSchema, payrollRunCreateSchema, payrollRunStatusSchema,
    payrollListSchema, empComponentSchema,
    leaveTypeCreateSchema, leaveRequestCreateSchema, leaveRequestReviewSchema,
    attendanceCreateSchema, attendanceListSchema,
  } = require('../src/utils/validators');

  // Salary component
  it('salaryComponentSchema rejects missing type', () => {
    const r = salaryComponentSchema.safeParse({ name: 'Housing', value: 500 });
    expect(r.success).toBe(false);
    expect(r.error.errors.map((e) => e.path[0])).toContain('type');
  });

  it('salaryComponentSchema accepts valid ADDITION', () => {
    const r = salaryComponentSchema.safeParse({ name: 'Housing', type: 'ADDITION', value: 500 });
    expect(r.success).toBe(true);
    expect(r.data.name).toBe('Housing');
  });

  // Payroll run
  it('payrollRunCreateSchema accepts valid month/year', () => {
    const r = payrollRunCreateSchema.safeParse({ run_month: 3, run_year: 2026 });
    expect(r.success).toBe(true);
  });

  it('payrollRunCreateSchema rejects month > 12', () => {
    const r = payrollRunCreateSchema.safeParse({ run_month: 13, run_year: 2026 });
    expect(r.success).toBe(false);
  });

  it('payrollRunStatusSchema accepts APPROVED', () => {
    const r = payrollRunStatusSchema.safeParse({ status: 'APPROVED' });
    expect(r.success).toBe(true);
  });

  it('payrollRunStatusSchema rejects invalid status', () => {
    const r = payrollRunStatusSchema.safeParse({ status: 'DONE' });
    expect(r.success).toBe(false);
  });

  it('payrollListSchema applies defaults', () => {
    const r = payrollListSchema.safeParse({});
    expect(r.success).toBe(true);
    expect(r.data.page).toBe(1);
    expect(r.data.limit).toBe(20);
  });

  // Leave
  it('leaveTypeCreateSchema rejects missing name', () => {
    const r = leaveTypeCreateSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it('leaveTypeCreateSchema accepts valid type', () => {
    const r = leaveTypeCreateSchema.safeParse({ name: 'Annual Leave', max_days_per_year: 21 });
    expect(r.success).toBe(true);
    expect(r.data.gender_specific).toBe('ALL');
  });

  it('leaveRequestCreateSchema rejects missing start_date', () => {
    const r = leaveRequestCreateSchema.safeParse({ leave_type_id: 1, end_date: '2026-05-10' });
    expect(r.success).toBe(false);
  });

  it('leaveRequestReviewSchema accepts APPROVED', () => {
    const r = leaveRequestReviewSchema.safeParse({ status: 'APPROVED' });
    expect(r.success).toBe(true);
  });

  it('leaveRequestReviewSchema rejects PENDING', () => {
    // PENDING is not an allowed review decision
    const r = leaveRequestReviewSchema.safeParse({ status: 'PENDING' });
    expect(r.success).toBe(false);
  });

  // Attendance
  it('attendanceCreateSchema rejects missing employee_id', () => {
    const r = attendanceCreateSchema.safeParse({ work_date: '2026-03-01' });
    expect(r.success).toBe(false);
  });

  it('attendanceCreateSchema accepts valid payload', () => {
    const r = attendanceCreateSchema.safeParse({ employee_id: 1, work_date: '2026-03-01' });
    expect(r.success).toBe(true);
    expect(r.data.status).toBe('PRESENT');
    expect(r.data.source).toBe('MANUAL');
  });

  it('attendanceListSchema coerces page/limit strings', () => {
    const r = attendanceListSchema.safeParse({ page: '2', limit: '50' });
    expect(r.success).toBe(true);
    expect(r.data.page).toBe(2);
    expect(r.data.limit).toBe(50);
  });
});

