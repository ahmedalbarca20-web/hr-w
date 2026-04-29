'use strict';

const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const { sequelize, dialect } = require('../config/db');
const { getUploadsRoot } = require('../config/upload.paths');
const AttendanceRequest = require('../models/attendance_request.model');
const Attendance = require('../models/attendance.model');
const Employee = require('../models/employee.model');
const Company = require('../models/company.model');
const User = require('../models/user.model');
const pushSvc = require('./push_notification.service');
const { paginate, paginateResult } = require('../utils/pagination');
const { ymdInTimeZone, DEFAULT_IANA } = require('../utils/timezone');

const badReq = (msg) => Object.assign(new Error(msg), { statusCode: 400, code: 'VALIDATION_ERROR' });
const notFound = (msg) => Object.assign(new Error(msg), { statusCode: 404, code: 'NOT_FOUND' });

const PENDING_PHOTO_TTL_MS = 24 * 60 * 60 * 1000;

function hasPhotoSqlFragment() {
  const bin = dialect === 'postgres'
    ? '(photo_binary IS NOT NULL AND octet_length(photo_binary) > 0)'
    : '(photo_binary IS NOT NULL AND length(photo_binary) > 0)';
  return `(CASE WHEN ${bin} OR (photo_path IS NOT NULL AND photo_path != '') THEN 1 ELSE 0 END)`;
}

/** Remove photo bytes / file for one request (idempotent). */
async function stripAttendanceRequestPhoto(requestId) {
  const row = await AttendanceRequest.unscoped().findByPk(requestId, {
    attributes: ['id', 'photo_path'],
  });
  if (!row) return;
  const rel = row.get('photo_path');
  if (rel) {
    try {
      const clean = String(rel).replace(/^[/\\]?uploads[/\\]/i, '').replace(/\\/g, path.sep);
      const full = path.join(getUploadsRoot(), clean);
      if (fs.existsSync(full)) fs.unlinkSync(full);
    } catch {
      /* ignore */
    }
  }
  await AttendanceRequest.unscoped().update(
    { photo_binary: null, photo_mime: null, photo_path: null },
    { where: { id: requestId } },
  );
}

/** Pending requests older than 24h lose their photo (per retention policy). */
async function purgeExpiredPendingPhotos() {
  const cutoff = new Date(Date.now() - PENDING_PHOTO_TTL_MS);
  const stale = await AttendanceRequest.findAll({
    where: { status: 'PENDING', created_at: { [Op.lt]: cutoff } },
    attributes: ['id'],
  });
  await Promise.all(stale.map((r) => stripAttendanceRequestPhoto(r.id)));
}

async function companyTz(company_id) {
  const co = await Company.findByPk(company_id, { attributes: ['timezone'] });
  return (co?.timezone && String(co.timezone).trim()) || DEFAULT_IANA;
}

/**
 * @param {object} photo { buffer: Buffer, mime: string }
 */
async function submitRequest(company_id, employee_id, data, photo) {
  await purgeExpiredPendingPhotos();

  const emp = await Employee.findOne({ where: { id: employee_id, company_id }, attributes: ['id'] });
  if (!emp) throw badReq('Employee not found in this company');
  const buf = photo?.buffer;
  if (!Buffer.isBuffer(buf) || buf.length < 1) throw badReq('Photo is required');
  const mime = String(photo?.mime || '').trim();
  if (!/^image\/(jpeg|jpg|png|webp)$/i.test(mime)) throw badReq('Invalid photo type');

  const lat = Number(data.gps_latitude);
  const lng = Number(data.gps_longitude);
  const acc = Number(data.gps_accuracy_m);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw badReq('GPS coordinates are required');
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) throw badReq('Invalid GPS coordinates');
  if (!Number.isFinite(acc) || acc < 0) throw badReq('Invalid GPS accuracy');

  const tz = await companyTz(company_id);
  const now = new Date();
  const work_date = ymdInTimeZone(tz, now);

  const rec = await AttendanceRequest.create({
    company_id,
    employee_id,
    request_type: data.request_type,
    request_time: now,
    work_date,
    gps_latitude: lat,
    gps_longitude: lng,
    gps_accuracy_m: acc,
    photo_path: null,
    photo_binary: buf,
    photo_mime: mime,
    note: data.note || null,
    status: 'PENDING',
  });

  void (async () => {
    try {
      if (!pushSvc.isWebPushConfigured()) return;
      const emp = await Employee.findOne({
        where: { id: employee_id, company_id },
        attributes: ['first_name', 'last_name', 'employee_number'],
      });
      const who = emp
        ? `${String(emp.first_name || '').trim()} ${String(emp.last_name || '').trim()} (${emp.employee_number})`.trim()
        : `موظف #${employee_id}`;
      const typeLabel = data.request_type === 'CHECK_OUT' ? 'طلب خروج' : 'طلب دخول';
      await pushSvc.notifyCompanyAdminsHr(company_id, {
        title: 'طلب حضور اضطراري',
        body: `${who} — ${typeLabel}`,
        url: pushSvc.defaultOpenUrl('/attendance'),
        tag: `attendance-request-${rec.id}`,
      });
    } catch {
      /* non-fatal */
    }
  })();

  return rec;
}

async function listRequests(company_id, user, { page = 1, limit = 20, status, employee_id, from, to } = {}) {
  await purgeExpiredPendingPhotos();

  const roleRaw = user?.role;
  const role = typeof roleRaw === 'object' && roleRaw?.name
    ? String(roleRaw.name).toUpperCase()
    : String(roleRaw || '').toUpperCase();
  const privileged = ['ADMIN', 'HR', 'SUPER_ADMIN'].includes(role) || Boolean(user?.is_super_admin);
  const where = { company_id };
  if (!privileged && user?.employee_id) where.employee_id = user.employee_id;
  if (privileged && employee_id) where.employee_id = employee_id;
  if (status) where.status = status;
  if (from || to) {
    where.work_date = {};
    if (from) where.work_date[Op.gte] = from;
    if (to) where.work_date[Op.lte] = to;
  }

  const { rows, count } = await AttendanceRequest.findAndCountAll({
    where,
    attributes: {
      exclude: ['photo_binary'],
      include: [[sequelize.literal(hasPhotoSqlFragment()), 'has_photo']],
    },
    include: [{ model: Employee, as: 'employee', attributes: ['id', 'first_name', 'last_name', 'employee_number'] }],
    order: [['created_at', 'DESC']],
    ...paginate(page, limit),
  });
  return paginateResult(rows, count, page, limit);
}

async function reviewRequest(id, company_id, reviewer_id, { status, rejection_reason }) {
  const reqRow = await AttendanceRequest.findOne({ where: { id, company_id } });
  if (!reqRow) throw notFound('Attendance request not found');
  if (reqRow.status !== 'PENDING') throw badReq('Request is no longer pending');

  if (status === 'REJECTED') {
  await reqRow.update({
    status: 'REJECTED',
    reviewed_by: reviewer_id,
    reviewed_at: new Date(),
    rejection_reason: rejection_reason || null,
  });
    await stripAttendanceRequestPhoto(reqRow.id);
    void notifyEmployeeAttendanceRequestResult(company_id, reqRow.employee_id, 'REJECTED', rejection_reason);
    return reqRow.reload();
  }

  const [att] = await Attendance.findOrCreate({
    where: { company_id, employee_id: reqRow.employee_id, work_date: reqRow.work_date },
    defaults: {
      company_id,
      employee_id: reqRow.employee_id,
      work_date: reqRow.work_date,
      status: 'PRESENT',
      source: 'MANUAL',
      check_in: reqRow.request_type === 'CHECK_IN' ? reqRow.request_time : null,
      check_out: reqRow.request_type === 'CHECK_OUT' ? reqRow.request_time : null,
      notes: 'Approved from mobile attendance request',
      created_by: reviewer_id,
    },
  });

  if (reqRow.request_type === 'CHECK_IN') {
    if (att.check_in) throw badReq('Employee already has check-in for this date');
    await att.update({ check_in: reqRow.request_time, status: 'PRESENT' });
  } else {
    if (!att.check_in) throw badReq('Cannot approve check-out before check-in exists');
    if (att.check_out) throw badReq('Employee already has check-out for this date');
    const mins = Math.max(0, Math.round((new Date(reqRow.request_time) - new Date(att.check_in)) / 60000));
    await att.update({ check_out: reqRow.request_time, total_minutes: mins });
  }

  await reqRow.update({
    status: 'APPROVED',
    reviewed_by: reviewer_id,
    reviewed_at: new Date(),
    rejection_reason: null,
  });
  await stripAttendanceRequestPhoto(reqRow.id);
  void notifyEmployeeAttendanceRequestResult(company_id, reqRow.employee_id, 'APPROVED', null);
  return reqRow.reload();
}

async function notifyEmployeeAttendanceRequestResult(company_id, employee_id, status, rejection_reason) {
  try {
    if (!pushSvc.isWebPushConfigured()) return;
    const acc = await User.findOne({
      where: { employee_id, company_id, is_active: 1 },
      attributes: ['id'],
    });
    if (!acc) return;
    const ok = status === 'APPROVED';
    await pushSvc.notifyUser(acc.id, {
      title: ok ? 'تمت الموافقة على طلب الحضور' : 'تم رفض طلب الحضور',
      body: ok
        ? 'سُجّل حضورك من طلب البصمة الاضطرارية.'
        : String(rejection_reason || 'راجع الإدارة للتفاصيل.'),
      url: pushSvc.defaultOpenUrl('/employees/profile'),
      tag: `attendance-request-result-${employee_id}`,
    });
  } catch {
    /* ignore */
  }
}

module.exports = { submitRequest, listRequests, reviewRequest };
