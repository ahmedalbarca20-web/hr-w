'use strict';

const asyncHandler  = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/response');
const svc           = require('../services/device.service');
const { zId }       = require('../utils/validators');
const { getCompanyEnabledFeatures } = require('../services/company-feature.service');

const {
  deviceCreateSchema,
  deviceUpdateSchema,
  deviceProbeSchema,
  deviceZkSocketProbeSchema,
  deviceDebugZkConnectionSchema,
  deviceZkSocketByDeviceSchema,
  devicePushSchema,
  deviceLogListSchema,
  deviceTestIngestSchema,
  deviceSyncUsersSchema,
  deviceZkDeviceUsersQuerySchema,
  deviceZkImportUsersSchema,
  deviceZkSetUserPrivilegeSchema,
  deviceZkUnlockBodySchema,
  deviceZkImportAttendanceSchema,
} = require('../utils/validators');

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve company_id: super-admin can scope to any company via ?company_id=N,
 * everyone else is isolated to their own company.
 */
function resolveCompanyId(req) {
  if (!req.user.company_id && req.query.company_id) return Number(req.query.company_id);
  return req.user.company_id;
}

/** إظهار PIN جهاز ZK في الاستجابة: السوبر أدمن دائماً؛ غيره فقط إن فُعّلت ميزة الشركة `zk_device_pin`. */
async function zkDevicePinRevealAllowed(req, companyId) {
  const sa = Boolean(req.user?.is_super_admin) || String(req.user?.role || '').toUpperCase() === 'SUPER_ADMIN';
  if (sa) return true;
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid < 1) return false;
  const feats = await getCompanyEnabledFeatures(cid);
  return Array.isArray(feats) && feats.includes('zk_device_pin');
}

function parseId(req, res) {
  const parsed = zId.safeParse(req.params.id);
  if (!parsed.success) {
    sendError(res, 'Invalid ID', 400, 'VALIDATION_ERROR');
    return null;
  }
  return parsed.data;
}

function toIsoDateTime(v) {
  if (!v) return null;
  const raw = String(v).trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  const m = raw.match(/^(\d{4})[-/](\d{2})[-/](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [, y, mo, da, h, mi, s = '00'] = m;
  return new Date(`${y}-${mo}-${da}T${h}:${mi}:${s}Z`).toISOString();
}

function mapRawLogRow(row) {
  if (!row || typeof row !== 'object') return null;
  const card_number = String(
    row.card_number
      ?? row.card
      ?? row.Card
      ?? row.pin
      ?? row.PIN
      ?? row.user_id
      ?? row.userId
      ?? row.UserID
      ?? row.enrollNumber
      ?? '',
  ).trim();
  const event_time = toIsoDateTime(
    row.event_time
      ?? row.eventTime
      ?? row.timestamp
      ?? row.record_time
      ?? row.DateTime
      ?? row.datetime
      ?? row.time,
  );
  if (!card_number || !event_time) return null;
  return {
    card_number,
    event_type: 'CHECK_IN',
    event_time,
    raw: row,
  };
}

function normalizeIncomingPushLogs(body) {
  if (!body) return [];
  if (Array.isArray(body.logs)) return body.logs;
  if (Array.isArray(body.AttLog)) return body.AttLog.map(mapRawLogRow).filter(Boolean);
  if (Array.isArray(body.attlog)) return body.attlog.map(mapRawLogRow).filter(Boolean);
  if (Array.isArray(body.rows)) return body.rows.map(mapRawLogRow).filter(Boolean);
  const one = mapRawLogRow(body);
  return one ? [one] : [];
}

// ════════════════════════════════════════════════════════════════════════════
// DEVICE CRUD
// ════════════════════════════════════════════════════════════════════════════

const listDevices = asyncHandler(async (req, res) => {
  const company_id = resolveCompanyId(req);
  const { status, mode, type, department_id } = req.query;
  const data = await svc.listDevices(company_id, { status, mode, type, department_id });
  sendSuccess(res, data);
});

const getDevice = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const company_id = resolveCompanyId(req);
  const data = await svc.getDevice(id, company_id);
  sendSuccess(res, data);
});

const listEmployeeOptions = asyncHandler(async (req, res) => {
  const company_id = resolveCompanyId(req);
  if (company_id == null || !Number.isFinite(Number(company_id)) || Number(company_id) < 1) {
    return sendError(res, 'company_id is required (select a company or use a company-scoped account)', 422, 'VALIDATION_ERROR');
  }
  const data = await svc.listEmployeesForDevicePicker(company_id);
  sendSuccess(res, data);
});

const probeConnection = asyncHandler(async (req, res) => {
  const parsed = deviceProbeSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.errors[0]?.message, 422, 'VALIDATION_ERROR');

  const data = await svc.probeDeviceConnection(parsed.data);
  const msg  = data.ok
    ? 'تم قراءة الرقم التسلسلي من الجهاز.'
    : (data.message || 'تعذّر إكمال الاختبار.');
  sendSuccess(res, data, msg);
});

/** LAN ZK binary protocol via zkteco-js (TCP then UDP fallback). */
const probeZkSocket = asyncHandler(async (req, res) => {
  const parsed = deviceZkSocketProbeSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.errors[0]?.message, 422, 'VALIDATION_ERROR');
  const data = await svc.probeZkSocket(parsed.data);
  const msg = data.ok
    ? 'تمت قراءة الجهاز عبر zkteco-js (بروتوكول ZK).'
    : 'تعذّر الاتصال ببروتوكول الجهاز — راجع errors في الاستجابة.';
  sendSuccess(res, data, msg);
});

/** ZK + HTTP + env + optional DTR snapshot — for local troubleshooting only. */
const debugZkConnection = asyncHandler(async (req, res) => {
  const parsed = deviceDebugZkConnectionSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.errors[0]?.message, 422, 'VALIDATION_ERROR');
  const data = await svc.debugZkConnection(parsed.data);
  sendSuccess(res, data, 'تقرير تشخيص الاتصال (ZK + HTTP + البيئة).');
});

const readZkFromDevice = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const parsed = deviceZkSocketByDeviceSchema.safeParse(req.body || {});
  if (!parsed.success) return sendError(res, parsed.error.errors[0]?.message, 422, 'VALIDATION_ERROR');
  const data = await svc.readZkFromRegisteredDevice(id, resolveCompanyId(req), parsed.data);
  const msg = data.ok
    ? 'تمت القراءة من الجهاز المسجّل عبر zkteco-js.'
    : 'تعذّر الاتصال — راجع errors في الاستجابة.';
  sendSuccess(res, data, msg);
});

const listZkDeviceUsers = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const parsed = deviceZkDeviceUsersQuerySchema.safeParse(req.query || {});
  if (!parsed.success) return sendError(res, parsed.error.errors[0]?.message, 422, 'VALIDATION_ERROR');
  const company_id = resolveCompanyId(req);
  if (company_id == null || !Number.isFinite(Number(company_id)) || Number(company_id) < 1) {
    return sendError(res, 'company_id is required (select a company or use a company-scoped account)', 422, 'VALIDATION_ERROR');
  }
  const pinAllowed = await zkDevicePinRevealAllowed(req, company_id);
  const query = { ...parsed.data, include_password: parsed.data.include_password === true && pinAllowed };
  const data = await svc.listZkUsersOnDevice(id, company_id, query);
  sendSuccess(res, { ...data, zk_pin_view_allowed: pinAllowed }, 'تم جلب مستخدمي الجهاز من بروتوكول ZK.');
});

const importZkUsersToEmployees = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const parsed = deviceZkImportUsersSchema.safeParse(req.body || {});
  if (!parsed.success) return sendError(res, parsed.error.errors[0]?.message, 422, 'VALIDATION_ERROR');
  const company_id = resolveCompanyId(req);
  if (company_id == null || !Number.isFinite(Number(company_id)) || Number(company_id) < 1) {
    return sendError(res, 'company_id is required (select a company or use a company-scoped account)', 422, 'VALIDATION_ERROR');
  }
  const pinAllowed = await zkDevicePinRevealAllowed(req, company_id);
  const body = { ...parsed.data, include_password: parsed.data.include_password === true && pinAllowed };
  const data = await svc.importZkUsersToEmployees(id, company_id, body);
  sendSuccess(res, { ...data, zk_pin_view_allowed: pinAllowed }, 'تم استيراد المستخدمين المحددين إلى قائمة الموظفين.');
});

const setZkDeviceUserPrivilege = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const parsed = deviceZkSetUserPrivilegeSchema.safeParse(req.body || {});
  if (!parsed.success) return sendError(res, parsed.error.errors[0]?.message, 422, 'VALIDATION_ERROR');
  const company_id = resolveCompanyId(req);
  if (company_id == null || !Number.isFinite(Number(company_id)) || Number(company_id) < 1) {
    return sendError(res, 'company_id is required (select a company or use a company-scoped account)', 422, 'VALIDATION_ERROR');
  }
  const data = await svc.setZkDeviceUserPrivilege(id, company_id, parsed.data);
  const msg = parsed.data.is_admin
    ? 'تم تفعيل صلاحية مدير الجهاز لهذا المستخدم على الجهاز.'
    : 'تم إلغاء صلاحية مدير الجهاز — أصبح المستخدم عادياً على الجهاز.';
  sendSuccess(res, data, msg);
});

const unlockDeviceZkSession = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const parsed = deviceZkUnlockBodySchema.safeParse(req.body || {});
  if (!parsed.success) return sendError(res, parsed.error.errors[0]?.message, 422, 'VALIDATION_ERROR');
  const company_id = resolveCompanyId(req);
  if (company_id == null || !Number.isFinite(Number(company_id)) || Number(company_id) < 1) {
    return sendError(res, 'company_id is required (select a company or use a company-scoped account)', 422, 'VALIDATION_ERROR');
  }
  const data = await svc.unlockDeviceZkSession(id, company_id, parsed.data);
  sendSuccess(res, data, 'تم إرسال أمر تفعيل الجهاز (فك قفل الشاشة) إلى الجهاز.');
});

const importZkAttendances = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const parsed = deviceZkImportAttendanceSchema.safeParse(req.body || {});
  if (!parsed.success) return sendError(res, parsed.error.errors[0]?.message, 422, 'VALIDATION_ERROR');
  const company_id = resolveCompanyId(req);
  if (company_id == null || !Number.isFinite(Number(company_id)) || Number(company_id) < 1) {
    return sendError(res, 'company_id is required (select a company or use a company-scoped account)', 422, 'VALIDATION_ERROR');
  }
  if (parsed.data.auto_process && !req.user?.is_super_admin) {
    const feats = Array.isArray(req.user.company_features) ? req.user.company_features : [];
    const hasProcess = feats.map((x) => String(x).toLowerCase()).includes('process');
    if (!hasProcess) {
      return sendError(
        res,
        'This feature is not enabled for your company: process',
        403,
        'FORBIDDEN',
      );
    }
  }
  const data = await svc.importZkAttendancesToDeviceLogs(id, company_id, parsed.data);
  sendSuccess(res, data, 'تم سحب سجلات البصمة من الجهاز إلى السجلات الخام.');
});

const createDevice = asyncHandler(async (req, res) => {
  const parsed = deviceCreateSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.errors[0]?.message, 422, 'VALIDATION_ERROR');

  const company_id = resolveCompanyId(req);
  const device     = await svc.createDevice(company_id, parsed.data);

  // NOTE: api_key is included in this response ONLY at creation time.
  // The admin must copy it — it will not be returned again.
  sendSuccess(res, device, 'Device created. Save the api_key — it will not be shown again.', 201);
});

const updateDevice = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const parsed = deviceUpdateSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.errors[0]?.message, 422, 'VALIDATION_ERROR');

  const company_id = resolveCompanyId(req);
  const data       = await svc.updateDevice(id, company_id, parsed.data);
  sendSuccess(res, data);
});

const deactivateDevice = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  await svc.deactivateDevice(id, resolveCompanyId(req));
  sendSuccess(res, null, 'Device deactivated');
});

const rotateApiKey = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const result = await svc.rotateApiKey(id, resolveCompanyId(req));
  sendSuccess(res, result, 'API key rotated. Save the new api_key — it will not be shown again.');
});

// ════════════════════════════════════════════════════════════════════════════
// PUSH ENDPOINT  – called by device hardware, not by HR users
// ════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/devices/push
 *
 * Expected body:
 * {
 *   "logs": [
 *     { "card_number": "123456", "event_type": "CHECK_IN", "event_time": "2026-03-01T09:00:00Z" },
 *     ...
 *   ]
 * }
 *
 * Authenticated by authenticateDevice middleware (X-Device-Serial + X-Device-Key).
 * req.device is the Device record set by that middleware.
 */
const push = asyncHandler(async (req, res) => {
  const normalizedLogs = normalizeIncomingPushLogs(req.body);
  const parsed = devicePushSchema.safeParse({ logs: normalizedLogs });
  if (!parsed.success) return sendError(res, parsed.error.errors[0]?.message, 422, 'VALIDATION_ERROR');

  // Attach metadata to raw_payload for audit trail
  req.body._meta = {
    received_at : new Date().toISOString(),
    remote_ip   : req.ip,
    device_serial: req.device.serial_number,
    push_shape  : Array.isArray(req.body?.logs)
      ? 'logs[]'
      : (Array.isArray(req.body?.AttLog) || Array.isArray(req.body?.attlog) ? 'attlog[]' : 'single-or-unknown'),
  };

  const result = await svc.pushLogs(req.device, parsed.data.logs, req.body);
  sendSuccess(res, result, 'Logs received');
});

// ════════════════════════════════════════════════════════════════════════════
// HEARTBEAT – device reports it is online (no business logic)
// ════════════════════════════════════════════════════════════════════════════

const heartbeat = asyncHandler(async (req, res) => {
  const result = await svc.heartbeat(req.device, req.body);
  sendSuccess(res, result);
});

// ════════════════════════════════════════════════════════════════════════════
// RAW LOG QUERIES
// ════════════════════════════════════════════════════════════════════════════

const listLogs = asyncHandler(async (req, res) => {
  const parsed = deviceLogListSchema.safeParse(req.query);
  if (!parsed.success) return sendError(res, parsed.error.errors[0]?.message, 422, 'VALIDATION_ERROR');

  const company_id = resolveCompanyId(req);
  const data       = await svc.listLogs(company_id, parsed.data);
  sendSuccess(res, data);
});

const getLog = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const data = await svc.getLog(id, resolveCompanyId(req));
  sendSuccess(res, data);
});

const reprocessLog = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const data = await svc.markForReprocess(id, resolveCompanyId(req));
  sendSuccess(res, data, 'Log marked for reprocessing');
});

const syncUsers = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const parsed = deviceSyncUsersSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.errors[0]?.message, 422, 'VALIDATION_ERROR');
  const data = await svc.syncDeviceUsers(id, resolveCompanyId(req), parsed.data.employee_ids);
  sendSuccess(res, data, 'Selected users synced to device');
});

const getPushConfig = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const company_id = resolveCompanyId(req);
  const data         = await svc.getPushConfig(id, company_id, req);
  sendSuccess(res, data);
});

const testDeviceIngest = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const parsed = deviceTestIngestSchema.safeParse(req.body || {});
  if (!parsed.success) return sendError(res, parsed.error.errors[0]?.message, 422, 'VALIDATION_ERROR');
  const company_id = resolveCompanyId(req);
  const data       = await svc.simulateTestIngest(id, company_id, parsed.data);
  sendSuccess(res, data, 'تم استلام سجل تجريبي بنجاح');
});

const reResolveLogs = asyncHandler(async (req, res) => {
  const company_id = resolveCompanyId(req);
  const data       = await svc.reResolveUnresolvedLogs(company_id);
  sendSuccess(res, data, `تمت معالجة ${data.total} سجل، وتم ربط ${data.resolved} موظف جديد بنجاح.`);
});

module.exports = {
  listDevices, getDevice, listEmployeeOptions, probeConnection, probeZkSocket, debugZkConnection, readZkFromDevice, listZkDeviceUsers, importZkUsersToEmployees, setZkDeviceUserPrivilege, unlockDeviceZkSession, importZkAttendances, createDevice, updateDevice, deactivateDevice, rotateApiKey,
  getPushConfig, testDeviceIngest,
  push, heartbeat,
  listLogs, getLog, reprocessLog, reResolveLogs,
  syncUsers,
};
