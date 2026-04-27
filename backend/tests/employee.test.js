'use strict';

/**
 * Employee module tests (no live DB required).
 * Integration tests (marked .skip) need a seeded DB.
 */

const request = require('supertest');
const app     = require('../src/app');

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns an Authorization header with a fake JWT to test auth guards. */
const fakeBearer = (token) => ({ Authorization: `Bearer ${token}` });

// ── No-auth guard tests ───────────────────────────────────────────────────────

describe('Employee routes — unauthenticated', () => {
  it('GET /api/employees → 401', async () => {
    const res = await request(app).get('/api/employees');
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('POST /api/employees → 401', async () => {
    const res = await request(app).post('/api/employees').send({});
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/employees/1 → 401', async () => {
    const res = await request(app).get('/api/employees/1');
    expect(res.statusCode).toBe(401);
  });

  it('PUT /api/employees/1 → 401', async () => {
    const res = await request(app).put('/api/employees/1').send({});
    expect(res.statusCode).toBe(401);
  });

  it('PATCH /api/employees/1/status → 401', async () => {
    const res = await request(app).patch('/api/employees/1/status').send({});
    expect(res.statusCode).toBe(401);
  });

  it('DELETE /api/employees/1 → 401', async () => {
    const res = await request(app).delete('/api/employees/1');
    expect(res.statusCode).toBe(401);
  });
});

// ── Department routes — unauthenticated ──────────────────────────────────────

describe('Department routes — unauthenticated', () => {
  it('GET /api/departments → 401', async () => {
    const res = await request(app).get('/api/departments');
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/departments → 401', async () => {
    const res = await request(app).post('/api/departments').send({});
    expect(res.statusCode).toBe(401);
  });
});

// ── Invalid token tests ───────────────────────────────────────────────────────

describe('Employee routes — invalid token', () => {
  it('GET /api/employees with bad token → 401 TOKEN_INVALID', async () => {
    const res = await request(app)
      .get('/api/employees')
      .set(fakeBearer('not.a.real.token'));
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('TOKEN_INVALID');
  });
});

// ── Route validation (malformed id param) ────────────────────────────────────

// These need a valid token to reach the id-validation layer.
// Skipped without a live DB to issue tokens.
describe.skip('Employee routes — id parameter validation', () => {
  let token;

  beforeAll(async () => {
    const res = await request(app).post('/api/auth/login').send({
      email     : process.env.TEST_USER_EMAIL    || 'admin@test.com',
      password  : process.env.TEST_USER_PASSWORD || 'admin123',
      company_id: parseInt(process.env.TEST_COMPANY_ID || '1', 10),
    });
    token = res.body.data?.accessToken;
  });

  it('GET /api/employees/abc → 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .get('/api/employees/abc')
      .set(fakeBearer(token));
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('GET /api/employees/-5 → 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .get('/api/employees/-5')
      .set(fakeBearer(token));
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

// ── Zod schema unit tests (no HTTP, no DB) ───────────────────────────────────

describe('Employee Zod validators (unit)', () => {
  const {
    employeeCreateSchema,
    employeeUpdateSchema,
    employeeStatusSchema,
    employeeListSchema,
  } = require('../src/utils/validators');

  it('employeeCreateSchema rejects missing required fields', () => {
    const result = employeeCreateSchema.safeParse({});
    expect(result.success).toBe(false);
    const fields = result.error.errors.map((e) => e.path[0]);
    expect(fields).toContain('first_name');
    expect(fields).toContain('last_name');
    expect(fields).toContain('employee_number');
    expect(fields).toContain('hire_date');
  });

  it('employeeCreateSchema accepts a valid payload', () => {
    const result = employeeCreateSchema.safeParse({
      first_name      : 'أحمد',
      last_name       : 'العمري',
      employee_number : 'EMP-001',
      hire_date       : '2024-01-15',
    });
    expect(result.success).toBe(true);
    expect(result.data.status).toBe('ACTIVE');
    expect(result.data.contract_type).toBe('FULL_TIME');
  });

  it('employeeCreateSchema rejects invalid hire_date format', () => {
    const result = employeeCreateSchema.safeParse({
      first_name      : 'Ali',
      last_name       : 'Hassan',
      employee_number : 'EMP-002',
      hire_date       : '15/01/2024',   // wrong format
    });
    expect(result.success).toBe(false);
  });

  it('employeeCreateSchema rejects invalid email', () => {
    const result = employeeCreateSchema.safeParse({
      first_name      : 'Ali',
      last_name       : 'Hassan',
      employee_number : 'EMP-003',
      hire_date       : '2024-01-15',
      email           : 'not-valid-email',
    });
    expect(result.success).toBe(false);
  });

  it('employeeUpdateSchema allows empty object (partial)', () => {
    const result = employeeUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('employeeStatusSchema rejects invalid status', () => {
    const result = employeeStatusSchema.safeParse({ status: 'UNKNOWN' });
    expect(result.success).toBe(false);
  });

  it('employeeStatusSchema accepts TERMINATED with termination_date', () => {
    const result = employeeStatusSchema.safeParse({
      status           : 'TERMINATED',
      termination_date : '2025-12-31',
    });
    expect(result.success).toBe(true);
  });

  it('employeeListSchema applies defaults', () => {
    const result = employeeListSchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data.page).toBe(1);
    expect(result.data.limit).toBe(20);
    expect(result.data.sort_dir).toBe('DESC');
  });

  it('employeeListSchema accepts large limit (no server-side cap)', () => {
    const result = employeeListSchema.safeParse({ limit: '50000' });
    expect(result.success).toBe(true);
    expect(result.data.limit).toBe(50000);
  });
});

// ── Pagination unit test ─────────────────────────────────────────────────────

describe('Pagination helper (unit)', () => {
  const { paginate, paginateResult } = require('../src/utils/pagination');

  it('paginate(1, 20) → offset 0, limit 20', () => {
    expect(paginate(1, 20)).toEqual({ offset: 0, limit: 20 });
  });

  it('paginate(3, 10) → offset 20, limit 10', () => {
    expect(paginate(3, 10)).toEqual({ offset: 20, limit: 10 });
  });

  it('paginateResult builds correct meta', () => {
    const { meta } = paginateResult([], 95, 2, 20);
    expect(meta.total).toBe(95);
    expect(meta.totalPages).toBe(5);
    expect(meta.hasNext).toBe(true);
    expect(meta.hasPrev).toBe(true);
  });

  it('paginate passes through large limit (no 100 cap)', () => {
    expect(paginate(1, 5000)).toEqual({ offset: 0, limit: 5000 });
  });
});

