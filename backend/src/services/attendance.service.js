'use strict';

const { Op }      = require('sequelize');
const Attendance  = require('../models/attendance.model');
const Employee    = require('../models/employee.model');
const SurpriseAttendanceEvent = require('../models/surprise_attendance.model');
const Company     = require('../models/company.model');
const { paginate, paginateResult } = require('../utils/pagination');
const { ymdInTimeZone, DEFAULT_IANA } = require('../utils/timezone');

async function todayYmdForCompany(company_id) {
  const c = await Company.findByPk(company_id, { attributes: ['timezone'] });
  const tz = (c && c.timezone && String(c.timezone).trim()) || DEFAULT_IANA;
  return ymdInTimeZone(tz);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const notFound = (id) => Object.assign(new Error(`Attendance record ${id} not found`), { statusCode: 404, code: 'NOT_FOUND' });
const badReq   = (msg) => Object.assign(new Error(msg), { statusCode: 400, code: 'VALIDATION_ERROR' });

// ── List ─────────────────────────────────────────────────────────────────────

async function list(company_id, { page = 1, limit = 20, employee_id, from, to, status } = {}, user = null) {
  const where = { company_id };
  const role = (user?.role || '').toString().toUpperCase();
  const privileged = ['ADMIN', 'HR', 'SUPER_ADMIN'].includes(role);
  if (!privileged && user?.employee_id) {
    where.employee_id = user.employee_id;
  } else if (employee_id) {
    where.employee_id = employee_id;
  }
  if (status)      where.status      = status;
  if (from || to) {
    where.work_date = {};
    if (from) where.work_date[Op.gte] = from;
    if (to)   where.work_date[Op.lte] = to;
  }

  const { rows, count } = await Attendance.findAndCountAll({
    where,
    include: [
      { model: Employee, as: 'employee', attributes: ['id', 'first_name', 'last_name', 'employee_number'] },
      {
        model      : SurpriseAttendanceEvent,
        as         : 'surprise_event',
        attributes : ['id', 'title', 'starts_at', 'ends_at', 'duration_minutes', 'status'],
        required   : false,
      },
    ],
    order  : [['work_date', 'DESC']],
    ...paginate(page, limit),
  });
  return paginateResult(rows, count, page, limit);
}

// ── Get one ───────────────────────────────────────────────────────────────────

async function getById(id, company_id, user = null) {
  const rec = await Attendance.findOne({
    where: { id, company_id },
    include: [
      { model: Employee, as: 'employee', attributes: ['id', 'first_name', 'last_name', 'employee_number'] },
      {
        model      : SurpriseAttendanceEvent,
        as         : 'surprise_event',
        attributes : ['id', 'title', 'starts_at', 'ends_at', 'duration_minutes', 'status'],
        required   : false,
      },
    ],
  });
  if (!rec) throw notFound(id);
  const role = (user?.role || '').toString().toUpperCase();
  const privileged = ['ADMIN', 'HR', 'SUPER_ADMIN'].includes(role);
  if (!privileged && user?.employee_id && Number(rec.employee_id) !== Number(user.employee_id)) {
    throw Object.assign(new Error('Forbidden: cannot access another employee attendance record'), {
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  }
  return rec;
}

// ── Check-in (employee self-service) ─────────────────────────────────────────

async function checkIn(employee_id, company_id) {
  const today = await todayYmdForCompany(company_id);
  const [rec, created] = await Attendance.findOrCreate({
    where  : { company_id, employee_id, work_date: today },
    defaults: {
      company_id, employee_id, work_date: today, status: 'PRESENT',
      source: 'MANUAL', check_in: new Date(), overtime_minutes: 0,
    },
  });
  if (!created && rec.check_in) throw badReq('Already checked in today');
  if (!created) await rec.update({ check_in: new Date(), status: 'PRESENT' });
  return rec.reload();
}

// ── Check-out (employee self-service) ────────────────────────────────────────

async function checkOut(employee_id, company_id) {
  const today = await todayYmdForCompany(company_id);
  const rec   = await Attendance.findOne({ where: { company_id, employee_id, work_date: today } });
  if (!rec)          throw badReq('No check-in found for today');
  if (!rec.check_in) throw badReq('Must check-in before check-out');
  if (rec.check_out) throw badReq('Already checked out today');

  const now     = new Date();
  const minutes = Math.round((now - new Date(rec.check_in)) / 60000);
  await rec.update({ check_out: now, total_minutes: minutes });
  return rec.reload();
}

// ── Create (HR/Admin manual entry) ───────────────────────────────────────────

async function create(company_id, data, created_by) {
  // Guard: employee must belong to same company
  const emp = await Employee.findOne({ where: { id: data.employee_id, company_id } });
  if (!emp) throw badReq('Employee not found in this company');

  const [rec, created] = await Attendance.findOrCreate({
    where   : { company_id, employee_id: data.employee_id, work_date: data.work_date },
    defaults: { ...data, company_id, created_by },
  });
  if (!created) throw badReq('Attendance record already exists for this employee on that date');
  return rec;
}

// ── Update ────────────────────────────────────────────────────────────────────

async function update(id, company_id, data) {
  const rec = await Attendance.findOne({ where: { id, company_id } });
  if (!rec) throw notFound(id);
  return rec.update(data);
}

// ── Delete ────────────────────────────────────────────────────────────────────

async function remove(id, company_id) {
  const rec = await Attendance.findOne({ where: { id, company_id } });
  if (!rec) throw notFound(id);
  await rec.destroy();
}

// ── Monthly summary ───────────────────────────────────────────────────────────

async function monthlySummary(company_id, employee_id, year, month, user = null) {
  const role = (user?.role || '').toString().toUpperCase();
  const privileged = ['ADMIN', 'HR', 'SUPER_ADMIN'].includes(role);
  const scopedEmployeeId = !privileged ? user?.employee_id : employee_id;
  const pad   = (n) => String(n).padStart(2, '0');
  const from  = `${year}-${pad(month)}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to    = `${year}-${pad(month)}-${pad(lastDay)}`;

  const records = await Attendance.findAll({
    where: { company_id, ...(scopedEmployeeId ? { employee_id: scopedEmployeeId } : {}), work_date: { [Op.between]: [from, to] } },
    attributes: ['status','total_minutes','overtime_minutes'],
  });

  return records.reduce(
    (acc, r) => {
      acc.total++;
      acc[r.status] = (acc[r.status] || 0) + 1;
      if (r.total_minutes)    acc.total_minutes    += Number(r.total_minutes);
      if (r.overtime_minutes) acc.overtime_minutes += Number(r.overtime_minutes);
      return acc;
    },
    { total: 0, total_minutes: 0, overtime_minutes: 0 }
  );
}

module.exports = { list, getById, checkIn, checkOut, create, update, remove, monthlySummary };

