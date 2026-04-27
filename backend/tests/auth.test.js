'use strict';

/**
 * Auth module integration tests.
 * Uses supertest to fire HTTP requests against the Express app.
 *
 * Database:  Tests expect a running DB (or you can mock Sequelize).
 *            Set TEST_DB_* env vars or use an in-memory SQLite adapter.
 *
 * Run:  npm test
 */

const request = require('supertest');
const app     = require('../src/app');

// ── Shared test state ────────────────────────────────────────────────────────
let accessToken  = '';
let refreshCookie = '';

// ── POST /api/auth/login ─────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('should return 422 when body is missing', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.statusCode).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  // Requires a running DB with company_id=1 in the companies table
  it.skip('should return 401 for invalid credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email     : 'nobody@example.com',
      password  : 'wrongpassword',
      company_id: 1,
    });
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  // Integration test — requires a seeded user in the DB
  it.skip('should return 200 and an access token for valid credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email     : process.env.TEST_USER_EMAIL    || 'admin@test.com',
      password  : process.env.TEST_USER_PASSWORD || 'admin123',
      company_id: parseInt(process.env.TEST_COMPANY_ID || '1', 10),
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();

    accessToken   = res.body.data.accessToken;
    refreshCookie = res.headers['set-cookie']?.[0] || '';
  });
});

// ── POST /api/auth/refresh ───────────────────────────────────────────────────

describe('POST /api/auth/refresh', () => {
  it('should return 401 when no refresh cookie is provided', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });
});

// ── GET /api/auth/me ─────────────────────────────────────────────────────────

describe('GET /api/auth/me', () => {
  it('should return 401 when no token is provided', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('should return 401 for a malformed token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not.a.real.token');
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('TOKEN_INVALID');
  });
});

// ── POST /api/auth/logout ────────────────────────────────────────────────────

describe('POST /api/auth/logout', () => {
  it('should return 401 when no token is provided', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.statusCode).toBe(401);
  });
});

// ── GET /api/health ──────────────────────────────────────────────────────────

describe('GET /api/health', () => {
  it('should return 200 with status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

