'use strict';

const Company = require('../models/company.model');
const { Device } = require('../models/device.model');
const Employee = require('../models/employee.model');
const WorkShift = require('../models/work_shift.model');
const attendanceProcessor = require('./attendance_processor.service');
const deviceSvc = require('./device.service');

function badReq(msg) {
  const e = new Error(msg);
  e.statusCode = 422;
  e.code = 'VALIDATION_ERROR';
  return e;
}

function normalizeTime(t) {
  const s = String(t || '').trim();
  if (!s) return null;
  if (/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(s)) return s;
  const m = s.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!m) return null;
  const hh = String(m[1]).padStart(2, '0');
  return `${hh}:${m[2]}:00`;
}

function hoursBetween(start, end) {
  const p = (t) => t.split(':').map((x) => Number(x));
  const [sh, sm] = p(start);
  const [eh, em] = p(end);
  let a = sh * 60 + sm;
  let b = eh * 60 + em;
  if (b <= a) b += 24 * 60;
  return Math.min(24, Math.round(((b - a) / 60) * 100) / 100);
}

async function loadCompany(companyId) {
  const co = await Company.findByPk(companyId, {
    attributes: ['id', 'onboarding_completed_at', 'onboarding_last_step', 'name'],
  });
  if (!co) throw Object.assign(new Error('Company not found'), { statusCode: 404 });
  return co;
}

async function assertOnboardingIncomplete(co) {
  if (co.onboarding_completed_at) throw badReq('Setup is already finished for this company.');
}

async function bumpStep(co, minStep) {
  const cur = Number(co.onboarding_last_step || 0);
  const next = Math.max(cur, minStep);
  if (next !== cur) await co.update({ onboarding_last_step: next });
  co.onboarding_last_step = next;
}

/** @param {import('../models/company.model')} co */
function uiStepFromCompany(co) {
  if (co.onboarding_completed_at) return 5;
  const s = Number(co.onboarding_last_step || 0);
  if (s <= 0) return 1;
  if (s === 1) return 2;
  if (s === 2) return 3;
  if (s === 3) return 4;
  return 4;
}

async function buildStatus(companyId) {
  const co = await loadCompany(companyId);
  const completed = co.onboarding_completed_at != null;
  const [deviceCount, employeeCount] = await Promise.all([
    Device.count({ where: { company_id: companyId } }),
    Employee.count({ where: { company_id: companyId, deleted_at: null } }),
  ]);
  return {
    completed,
    current_step: uiStepFromCompany(co),
    last_completed_step: Number(co.onboarding_last_step || 0),
    device_count: deviceCount,
    employee_count: employeeCount,
    company_name: co.name,
  };
}

async function start(companyId) {
  const co = await loadCompany(companyId);
  await assertOnboardingIncomplete(co);
  return buildStatus(companyId);
}

async function saveWorkHours(companyId, { work_start, work_end, work_days }) {
  const co = await loadCompany(companyId);
  await assertOnboardingIncomplete(co);
  const shiftStart = normalizeTime(work_start);
  const shiftEnd = normalizeTime(work_end);
  if (!shiftStart || !shiftEnd) throw badReq('Work start and end times are required.');
  const days = Array.isArray(work_days) && work_days.length
    ? work_days.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    : [1, 2, 3, 4, 5];
  if (days.length < 1) throw badReq('Select at least one working day.');
  const standard_hours = Math.max(0.5, Math.min(24, hoursBetween(shiftStart, shiftEnd)));

  const existing = await WorkShift.findOne({
    where: { company_id: companyId, is_default: 1 },
  });
  const payload = {
    name: 'Default schedule',
    name_ar: 'الدوام الافتراضي',
    shift_start: shiftStart,
    shift_end: shiftEnd,
    standard_hours,
    work_days: days,
    is_active: 1,
  };
  if (existing) {
    await existing.update(payload);
  } else {
    await attendanceProcessor.createShift(companyId, payload);
  }
  await bumpStep(co, 1);
  return buildStatus(companyId);
}

async function testDeviceConnection({ ip_address, port }) {
  const host = String(ip_address || '').trim();
  if (!host) throw badReq('Device address is required.');
  const p = Number(port) || 4370;
  try {
    const snap = await deviceSvc.probeZkSocket({
      ip_address: host,
      port: p,
      minimal_probe: true,
      include_users: false,
      max_users: 0,
      socket_timeout_ms: 12000,
    });
    if (snap && snap.ok) {
      return { ok: true, message: 'The device responded successfully.' };
    }
    return {
      ok: false,
      message: 'We could not reach a fingerprint device at that address. Check the cable, Wi‑Fi, and that the device is powered on.',
    };
  } catch (err) {
    return {
      ok: false,
      message: 'We could not reach a fingerprint device at that address. Check the network and try again.',
    };
  }
}

async function saveDevice(companyId, { name, ip_address, port }) {
  const co = await loadCompany(companyId);
  await assertOnboardingIncomplete(co);
  const nm = String(name || '').trim();
  const host = String(ip_address || '').trim();
  if (!nm) throw badReq('Device name is required.');
  if (!host) throw badReq('Device address is required.');
  const p = Number(port) || 4370;

  let serial = null;
  try {
    const snap = await deviceSvc.probeZkSocket({
      ip_address: host,
      port: p,
      minimal_probe: true,
      include_users: false,
      max_users: 0,
      socket_timeout_ms: 15000,
    });
    if (snap?.ok && snap.serial_number != null && String(snap.serial_number).trim()) {
      serial = String(snap.serial_number).trim().slice(0, 80);
    }
  } catch { /* fall through to synthetic */ }
  if (!serial) {
    serial = `HR-${host.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now()}`.slice(0, 80);
  }

  const dup = await Device.findOne({ where: { company_id: companyId, serial_number: serial } });
  if (dup) {
    await dup.update({ name: nm, ip_address: host, status: 'ACTIVE' });
  } else {
    await deviceSvc.createDevice(companyId, {
      name: nm,
      serial_number: serial,
      ip_address: host,
      type: 'FINGERPRINT',
      mode: 'ATTENDANCE',
      status: 'ACTIVE',
    });
  }
  await bumpStep(co, 2);
  const dev = await Device.findOne({
    where: { company_id: companyId, serial_number: serial },
    attributes: ['id', 'name', 'ip_address', 'serial_number', 'status'],
  });
  const st = await buildStatus(companyId);
  return { ...st, device: dev };
}

async function listDeviceEmployees(companyId, { device_id, port } = {}) {
  const co = await loadCompany(companyId);
  await assertOnboardingIncomplete(co);
  let dev;
  if (device_id != null && Number(device_id) > 0) {
    dev = await Device.findOne({ where: { id: device_id, company_id: companyId } });
  } else {
    dev = await Device.findOne({
      where: { company_id: companyId },
      order: [['id', 'DESC']],
    });
  }
  if (!dev) throw badReq('Add a device first before loading employees.');
  const data = await deviceSvc.listZkUsersOnDevice(dev.id, companyId, {
    port: port != null ? Number(port) : undefined,
    include_password: false,
  });
  return {
    device: { id: dev.id, name: dev.name },
    users: data.users || [],
    user_count_on_device: data.user_count_on_device ?? (data.users || []).length,
  };
}

async function importEmployees(companyId, { device_id, uids, skip } = {}) {
  const co = await loadCompany(companyId);
  await assertOnboardingIncomplete(co);
  if (skip === true) {
    await bumpStep(co, 3);
    return { ...await buildStatus(companyId), imported: 0, skipped: true };
  }
  const ids = Array.isArray(uids) ? uids.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n >= 0) : [];
  if (ids.length < 1) throw badReq('Choose at least one person to import, or use skip.');
  let devId = device_id;
  if (devId == null) {
    const d = await Device.findOne({ where: { company_id: companyId }, order: [['id', 'DESC']] });
    if (!d) throw badReq('Add a device first.');
    devId = d.id;
  }
  const result = await deviceSvc.importZkUsersToEmployees(devId, companyId, { uids: ids });
  await bumpStep(co, 3);
  const st = await buildStatus(companyId);
  return { ...st, imported: result.imported, results: result.results };
}

async function complete(companyId) {
  const co = await loadCompany(companyId);
  await assertOnboardingIncomplete(co);
  if (Number(co.onboarding_last_step || 0) < 3) {
    throw badReq('Finish the previous steps before completing setup.');
  }
  await co.update({
    onboarding_completed_at: new Date(),
    onboarding_last_step: 4,
  });
  return buildStatus(companyId);
}

/** Used by auth layer — who must see the wizard. */
function roleParticipatesInOnboarding(roleName) {
  const r = String(roleName || '').toUpperCase();
  return r === 'ADMIN' || r === 'HR';
}

async function onboardingFlagsForUser(user) {
  const roleName = String(
    (typeof user?.role === 'object' && user?.role?.name) ? user.role.name : user?.role || '',
  ).toUpperCase();
  if (roleName === 'SUPER_ADMIN' || !user?.company_id) {
    return { onboarding_required: false, onboarding_last_step: 0 };
  }
  if (!roleParticipatesInOnboarding(roleName) || roleName === 'EMPLOYEE') {
    return { onboarding_required: false, onboarding_last_step: 0 };
  }
  const co = await Company.findByPk(user.company_id, {
    attributes: ['onboarding_completed_at', 'onboarding_last_step'],
  });
  if (!co) return { onboarding_required: false, onboarding_last_step: 0 };
  const complete = co.onboarding_completed_at != null;
  return {
    onboarding_required: !complete,
    onboarding_last_step: Number(co.onboarding_last_step || 0),
  };
}

module.exports = {
  start,
  buildStatus,
  saveWorkHours,
  testDeviceConnection,
  saveDevice,
  listDeviceEmployees,
  importEmployees,
  complete,
  onboardingFlagsForUser,
  roleParticipatesInOnboarding,
};
