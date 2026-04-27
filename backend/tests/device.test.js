'use strict';

const request = require('supertest');
const app = require('../src/app');

// ─── Zod schema unit tests ────────────────────────────────────────────────────
const {
  deviceCreateSchema,
  deviceUpdateSchema,
  devicePushSchema,
  deviceLogListSchema,
} = require('../src/utils/validators');

// ─── Auth guard tests (no DB needed) ─────────────────────────────────────────
describe('Device Routes – auth guards', () => {
  describe('GET /api/devices', () => {
    it('returns 401 without JWT', async () => {
      const res = await request(app).get('/api/devices');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/devices/:id', () => {
    it('returns 401 without JWT', async () => {
      const res = await request(app).get('/api/devices/1');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/devices', () => {
    it('returns 401 without JWT', async () => {
      const res = await request(app).post('/api/devices').send({});
      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/devices/:id', () => {
    it('returns 401 without JWT', async () => {
      const res = await request(app).put('/api/devices/1').send({});
      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/devices/:id', () => {
    it('returns 401 without JWT', async () => {
      const res = await request(app).delete('/api/devices/1');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/devices/:id/rotate-key', () => {
    it('returns 401 without JWT', async () => {
      const res = await request(app).post('/api/devices/1/rotate-key');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/devices/logs', () => {
    it('returns 401 without JWT', async () => {
      const res = await request(app).get('/api/devices/logs');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/devices/logs/:id', () => {
    it('returns 401 without JWT', async () => {
      const res = await request(app).get('/api/devices/logs/1');
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/devices/logs/:id/reprocess', () => {
    it('returns 401 without JWT', async () => {
      const res = await request(app).patch('/api/devices/logs/1/reprocess');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/devices/probe-zk-socket', () => {
    it('returns 401 without JWT', async () => {
      const res = await request(app).post('/api/devices/probe-zk-socket').send({ ip_address: '192.168.1.1' });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/devices/:id/zk-socket-read', () => {
    it('returns 401 without JWT', async () => {
      const res = await request(app).post('/api/devices/1/zk-socket-read').send({});
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/devices/:id/zk-device-users', () => {
    it('returns 401 without JWT', async () => {
      const res = await request(app).get('/api/devices/1/zk-device-users');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/devices/:id/zk-import-users', () => {
    it('returns 401 without JWT', async () => {
      const res = await request(app).post('/api/devices/1/zk-import-users').send({ uids: [1] });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/devices/:id/zk-set-user-privilege', () => {
    it('returns 401 without JWT', async () => {
      const res = await request(app).post('/api/devices/1/zk-set-user-privilege').send({ uid: 1, is_admin: false });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/devices/:id/zk-unlock', () => {
    it('returns 401 without JWT', async () => {
      const res = await request(app).post('/api/devices/1/zk-unlock').send({});
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/devices/:id/zk-import-attendance', () => {
    it('returns 401 without JWT', async () => {
      const res = await request(app).post('/api/devices/1/zk-import-attendance').send({});
      expect(res.status).toBe(401);
    });
  });
});

// ─── Push endpoint – device auth guard ───────────────────────────────────────
describe('POST /api/devices/push – device auth', () => {
  it('returns 401 when no device headers provided', async () => {
    const res = await request(app)
      .post('/api/devices/push')
      .send({ logs: [] });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('DEVICE_UNAUTHORIZED');
  });

  it('returns 401 when only X-Device-Serial header provided', async () => {
    const res = await request(app)
      .post('/api/devices/push')
      .set('X-Device-Serial', 'SN-TEST-001')
      .send({ logs: [] });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('DEVICE_UNAUTHORIZED');
  });

  it('returns 401 when only X-Device-Key header provided', async () => {
    const res = await request(app)
      .post('/api/devices/push')
      .set('X-Device-Key', 'some-fake-key')
      .send({ logs: [] });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('DEVICE_UNAUTHORIZED');
  });

  it('returns 401 when both headers provided but credentials are wrong', async () => {
    const res = await request(app)
      .post('/api/devices/push')
      .set('X-Device-Serial', 'NONEXISTENT-SERIAL')
      .set('X-Device-Key', 'aaabbbcccdddeeefffaaabbbcccdddeeefffaaabbbcccdddeee')
      .send({ logs: [] });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('DEVICE_UNAUTHORIZED');
  });
});

// ─── Heartbeat endpoint – device auth guard ───────────────────────────────────
describe('POST /api/devices/heartbeat – device auth', () => {
  it('returns 401 when no device headers provided', async () => {
    const res = await request(app)
      .post('/api/devices/heartbeat')
      .send({});
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('DEVICE_UNAUTHORIZED');
  });

  it('returns 401 with wrong credentials', async () => {
    const res = await request(app)
      .post('/api/devices/heartbeat')
      .set('X-Device-Serial', 'FAKE')
      .set('X-Device-Key', 'fake-key-that-does-not-exist-in-db-at-all')
      .send({});
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('DEVICE_UNAUTHORIZED');
  });
});

// ─── Zod: deviceCreateSchema ──────────────────────────────────────────────────
describe('deviceCreateSchema', () => {
  const validPayload = {
    name: 'Main Entrance Reader',
    serial_number: 'SN-2024-001',
    location: 'Lobby',
    ip_address: '192.168.1.100',
    type: 'FINGERPRINT',
    mode: 'ATTENDANCE',
    status: 'ACTIVE',
  };

  it('accepts a valid full payload', () => {
    const result = deviceCreateSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('accepts payload with only required fields (name + serial_number)', () => {
    const result = deviceCreateSchema.safeParse({
      name: 'Device A',
      serial_number: 'SN-X-001',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    const { name, ...rest } = validPayload;
    const result = deviceCreateSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects missing serial_number', () => {
    const { serial_number, ...rest } = validPayload;
    const result = deviceCreateSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects invalid type enum value', () => {
    const result = deviceCreateSchema.safeParse({
      ...validPayload,
      type: 'RETINA',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid mode enum value', () => {
    const result = deviceCreateSchema.safeParse({
      ...validPayload,
      mode: 'INVALID_MODE',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid status enum value', () => {
    const result = deviceCreateSchema.safeParse({
      ...validPayload,
      status: 'DELETED',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid ip_address / hostname', () => {
    const result = deviceCreateSchema.safeParse({
      ...validPayload,
      ip_address: 'not valid <<<>>>',
    });
    expect(result.success).toBe(false);
  });

  it('accepts hostname as network address', () => {
    const result = deviceCreateSchema.safeParse({
      ...validPayload,
      ip_address: 'zk-reader.office.local',
    });
    expect(result.success).toBe(true);
  });

  it('applies default type FINGERPRINT when omitted', () => {
    const { type, ...rest } = validPayload;
    const result = deviceCreateSchema.safeParse(rest);
    expect(result.success).toBe(true);
    expect(result.data.type).toBe('FINGERPRINT');
  });

  it('applies default mode ATTENDANCE when omitted', () => {
    const { mode, ...rest } = validPayload;
    const result = deviceCreateSchema.safeParse(rest);
    expect(result.success).toBe(true);
    expect(result.data.mode).toBe('ATTENDANCE');
  });

  it('applies default status ACTIVE when omitted', () => {
    const { status, ...rest } = validPayload;
    const result = deviceCreateSchema.safeParse(rest);
    expect(result.success).toBe(true);
    expect(result.data.status).toBe('ACTIVE');
  });

  it('accepts VERIFY_ONLY as a valid mode', () => {
    const result = deviceCreateSchema.safeParse({
      ...validPayload,
      mode: 'VERIFY_ONLY',
    });
    expect(result.success).toBe(true);
  });

  it('accepts all valid device types', () => {
    const types = ['FINGERPRINT', 'CARD', 'FACE', 'PIN', 'HYBRID'];
    for (const type of types) {
      const result = deviceCreateSchema.safeParse({ ...validPayload, type });
      expect(result.success).toBe(true);
    }
  });

  it('accepts IPv6 address', () => {
    const result = deviceCreateSchema.safeParse({
      ...validPayload,
      ip_address: '::1',
    });
    expect(result.success).toBe(true);
  });
});

// ─── Zod: deviceUpdateSchema ──────────────────────────────────────────────────
describe('deviceUpdateSchema', () => {
  it('accepts empty object (all fields optional)', () => {
    const result = deviceUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts partial update with just name', () => {
    const result = deviceUpdateSchema.safeParse({ name: 'Updated Name' });
    expect(result.success).toBe(true);
  });

  it('does not allow serial_number field (omitted)', () => {
    const result = deviceUpdateSchema.safeParse({
      name: 'Test',
      serial_number: 'NEW-SN',
    });
    // serial_number is omitted from the schema, so it should be stripped or rejected
    if (result.success) {
      expect(result.data.serial_number).toBeUndefined();
    } else {
      // Strict mode would reject – either behavior is acceptable
      expect(result.success).toBe(false);
    }
  });

  it('rejects invalid mode', () => {
    const result = deviceUpdateSchema.safeParse({ mode: 'BAD' });
    expect(result.success).toBe(false);
  });
});

// ─── Zod: devicePushSchema ────────────────────────────────────────────────────
describe('devicePushSchema', () => {
  const validLog = {
    card_number: 'CARD-001',
    event_type: 'CHECK_IN',
    event_time: '2024-01-15T08:30:00.000Z',
  };

  it('accepts a valid push payload', () => {
    const result = devicePushSchema.safeParse({ logs: [validLog] });
    expect(result.success).toBe(true);
  });

  it('rejects empty logs array', () => {
    const result = devicePushSchema.safeParse({ logs: [] });
    expect(result.success).toBe(false);
  });

  it('accepts large logs array (no per-push entry cap)', () => {
    const logs = Array.from({ length: 501 }, () => ({ ...validLog }));
    const result = devicePushSchema.safeParse({ logs });
    expect(result.success).toBe(true);
    expect(result.data.logs.length).toBe(501);
  });

  it('rejects log entry missing card_number', () => {
    const { card_number, ...rest } = validLog;
    const result = devicePushSchema.safeParse({ logs: [rest] });
    expect(result.success).toBe(false);
  });

  it('defaults event_type to CHECK_IN when omitted', () => {
    const { event_type, ...rest } = validLog;
    const result = devicePushSchema.safeParse({ logs: [rest] });
    expect(result.success).toBe(true);
    expect(result.data.logs[0].event_type).toBe('CHECK_IN');
  });

  it('rejects log entry missing event_time', () => {
    const { event_time, ...rest } = validLog;
    const result = devicePushSchema.safeParse({ logs: [rest] });
    expect(result.success).toBe(false);
  });

  it('rejects invalid event_type', () => {
    const result = devicePushSchema.safeParse({
      logs: [{ ...validLog, event_type: 'UNKNOWN_EVENT' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid event_time (not ISO datetime)', () => {
    const result = devicePushSchema.safeParse({
      logs: [{ ...validLog, event_time: 'not-a-date' }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts log with optional raw field', () => {
    const result = devicePushSchema.safeParse({
      logs: [{ ...validLog, raw: { extra_data: 'abc' } }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts all valid event_types', () => {
    const types = ['CHECK_IN', 'CHECK_OUT', 'VERIFY', 'ALARM', 'OTHER'];
    for (const event_type of types) {
      const result = devicePushSchema.safeParse({
        logs: [{ ...validLog, event_type }],
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects missing logs key entirely', () => {
    const result = devicePushSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ─── Zod: deviceLogListSchema ─────────────────────────────────────────────────
describe('deviceLogListSchema', () => {
  it('accepts empty object (all optional)', () => {
    const result = deviceLogListSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts valid full filter', () => {
    const result = deviceLogListSchema.safeParse({
      page: '2',
      limit: '25',
      device_id: '5',
      employee_id: '10',
      event_type: 'CHECK_IN',
      from: '2024-01-01',
      to: '2024-01-31',
      is_duplicate: '0',
      is_verify_only: '1',
      processed: '0',
    });
    expect(result.success).toBe(true);
  });

  it('rejects page less than 1', () => {
    const result = deviceLogListSchema.safeParse({ page: '0' });
    expect(result.success).toBe(false);
  });

  it('accepts large limit for device logs (no max cap)', () => {
    const result = deviceLogListSchema.safeParse({ limit: '100000' });
    expect(result.success).toBe(true);
    expect(result.data.limit).toBe(100000);
  });

  it('rejects invalid event_type enum', () => {
    const result = deviceLogListSchema.safeParse({ event_type: 'BAD_TYPE' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid is_duplicate value', () => {
    const result = deviceLogListSchema.safeParse({ is_duplicate: '2' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid is_verify_only value', () => {
    const result = deviceLogListSchema.safeParse({ is_verify_only: '5' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid processed value', () => {
    const result = deviceLogListSchema.safeParse({ processed: 'yes' });
    expect(result.success).toBe(false);
  });
});
