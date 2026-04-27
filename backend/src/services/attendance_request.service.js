'use strict';

const { Op } = require('sequelize');
const AttendanceRequest = require('../models/attendance_request.model');
const Attendance = require('../models/attendance.model');
const Employee = require('../models/employee.model');
const Company = require('../models/company.model');
const { paginate, paginateResult } = require('../utils/pagination');
const { ymdInTimeZone, DEFAULT_IANA } = require('../utils/timezone');

const badReq = (msg) => Object.assign(new Error(msg), { statusCode: 400, code: 'VALIDATION_ERROR' });
const notFound = (msg) => Object.assign(new Error(msg), { statusCode: 404, code: 'NOT_FOUND' });

async function companyTz(company_id) {
  const co = await Company.findByPk(company_id, { attributes: ['timezone'] });
  return (co?.timezone && String(co.timezone).trim()) || DEFAULT_IANA;
}

async function submitRequest(company_id, employee_id, data, photoPath) {
  const emp = await Employee.findOne({ where: { id: employee_id, company_id }, attributes: ['id'] });
  if (!emp) throw badReq('Employee not found in this company');
  if (!photoPath) throw badReq('Photo is required');

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
    photo_path: photoPath,
    note: data.note || null,
    status: 'PENDING',
  });
  return rec;
}

async function listRequests(company_id, user, { page = 1, limit = 20, status, employee_id, from, to } = {}) {
  const role = (user?.role || '').toString().toUpperCase();
  const privileged = ['ADMIN', 'HR', 'SUPER_ADMIN'].includes(role);
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
    include: [{ model: Employee, as: 'employee', attributes: ['id', 'first_name', 'last_name', 'employee_number'] }],
    order: [['created_at', 'DESC']],
    ...paginate(page, limit),
  });
  return paginateResult(rows, count, page, limit);
}

async function reviewRequest(id, company_id, reviewer_id, { status, rejection_reason }) {
  const req = await AttendanceRequest.findOne({ where: { id, company_id } });
  if (!req) throw notFound('Attendance request not found');
  if (req.status !== 'PENDING') throw badReq('Request is no longer pending');

  if (status === 'REJECTED') {
    await req.update({
      status: 'REJECTED',
      reviewed_by: reviewer_id,
      reviewed_at: new Date(),
      rejection_reason: rejection_reason || null,
    });
    return req.reload();
  }

  const [att] = await Attendance.findOrCreate({
    where: { company_id, employee_id: req.employee_id, work_date: req.work_date },
    defaults: {
      company_id,
      employee_id: req.employee_id,
      work_date: req.work_date,
      status: 'PRESENT',
      source: 'MANUAL',
      check_in: req.request_type === 'CHECK_IN' ? req.request_time : null,
      check_out: req.request_type === 'CHECK_OUT' ? req.request_time : null,
      notes: 'Approved from mobile attendance request',
      created_by: reviewer_id,
    },
  });

  if (req.request_type === 'CHECK_IN') {
    if (att.check_in) throw badReq('Employee already has check-in for this date');
    await att.update({ check_in: req.request_time, status: 'PRESENT' });
  } else {
    if (!att.check_in) throw badReq('Cannot approve check-out before check-in exists');
    if (att.check_out) throw badReq('Employee already has check-out for this date');
    const mins = Math.max(0, Math.round((new Date(req.request_time) - new Date(att.check_in)) / 60000));
    await att.update({ check_out: req.request_time, total_minutes: mins });
  }

  await req.update({
    status: 'APPROVED',
    reviewed_by: reviewer_id,
    reviewed_at: new Date(),
    rejection_reason: null,
  });
  return req.reload();
}

module.exports = { submitRequest, listRequests, reviewRequest };
