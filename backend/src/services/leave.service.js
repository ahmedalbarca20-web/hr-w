'use strict';

const { Op }    = require('sequelize');
const { LeaveType, LeaveBalance, LeaveRequest } = require('../models/leave.model');
const Employee  = require('../models/employee.model');
const { paginate, paginateResult } = require('../utils/pagination');
const { ymdInTimeZone, DEFAULT_IANA } = require('../utils/timezone');

// ── Helpers ──────────────────────────────────────────────────────────────────

const notFound = (entity, id) =>
  Object.assign(new Error(`${entity} ${id} not found`), { statusCode: 404, code: 'NOT_FOUND' });
const badReq = (msg) =>
  Object.assign(new Error(msg), { statusCode: 400, code: 'VALIDATION_ERROR' });
const forbidden = (msg) =>
  Object.assign(new Error(msg), { statusCode: 403, code: 'FORBIDDEN' });

// ════════════════════════════════════════════════════════════════
// LEAVE TYPES
// ════════════════════════════════════════════════════════════════

async function listTypes(company_id, activeOnly = true) {
  const where = { company_id };
  if (activeOnly) where.is_active = 1;
  return LeaveType.findAll({ where, order: [['name', 'ASC']] });
}

async function createType(company_id, data) {
  return LeaveType.create({ ...data, company_id });
}

async function updateType(id, company_id, data) {
  const lt = await LeaveType.findOne({ where: { id, company_id } });
  if (!lt) throw notFound('LeaveType', id);
  return lt.update(data);
}

async function deactivateType(id, company_id) {
  const lt = await LeaveType.findOne({ where: { id, company_id } });
  if (!lt) throw notFound('LeaveType', id);
  // Check no PENDING requests still use this type
  const pending = await LeaveRequest.count({ where: { leave_type_id: id, company_id, status: 'PENDING' } });
  if (pending > 0) throw badReq(`Cannot deactivate: ${pending} pending request(s) exist for this leave type`);
  return lt.update({ is_active: 0 });
}

// ════════════════════════════════════════════════════════════════
// LEAVE BALANCES
// ════════════════════════════════════════════════════════════════

async function listBalances(company_id, { employee_id, leave_type_id, year } = {}) {
  const where = { company_id };
  if (employee_id)   where.employee_id   = employee_id;
  if (leave_type_id) where.leave_type_id = leave_type_id;
  if (year)          where.year          = year;
  return LeaveBalance.findAll({
    where,
    include: [
      { model: Employee,  as: 'employee',   attributes: ['id','first_name','last_name','employee_number'] },
      { model: LeaveType, as: 'leaveType',  attributes: ['id','name','name_ar'] },
    ],
    order: [['year','DESC'],['employee_id','ASC']],
  });
}

async function setBalance(company_id, data) {
  // Ensure employee + leave_type belong to company
  const emp = await Employee.findOne({ where: { id: data.employee_id, company_id } });
  if (!emp) throw badReq('Employee not found in this company');
  const lt = await LeaveType.findOne({ where: { id: data.leave_type_id, company_id } });
  if (!lt) throw badReq('Leave type not found in this company');

  const used = Number(data.used_days || 0);
  const pend = Number(data.pending_days || 0);
  const total = Number(data.total_days);
  if (total < used + pend) {
    throw badReq(`total_days must be at least used (${used}) + pending (${pend})`);
  }

  const [balance] = await LeaveBalance.findOrCreate({
    where   : { company_id, employee_id: data.employee_id, leave_type_id: data.leave_type_id, year: data.year },
    defaults: { ...data, company_id },
  });
  if (balance.total_days !== data.total_days ||
      balance.used_days  !== (data.used_days || 0) ||
      balance.pending_days !== (data.pending_days || 0)) {
    await balance.update({
      total_days  : data.total_days,
      used_days   : data.used_days   || 0,
      pending_days: data.pending_days || 0,
    });
  }
  return balance.reload();
}

// ════════════════════════════════════════════════════════════════
// LEAVE REQUESTS
// ════════════════════════════════════════════════════════════════

async function listRequests(company_id, user, { page = 1, limit = 20, employee_id, leave_type_id, status, year } = {}) {
  const where = { company_id };
  // Non-admin employees see only their own requests
  if (!['ADMIN','HR','SUPER_ADMIN'].includes(user.role || '')) {
    where.employee_id = user.employee_id;
  } else if (employee_id) {
    where.employee_id = employee_id;
  }
  if (leave_type_id) where.leave_type_id = leave_type_id;
  if (status)        where.status        = status;
  if (year) {
    where.start_date = { [Op.between]: [`${year}-01-01`, `${year}-12-31`] };
  }

  const { rows, count } = await LeaveRequest.findAndCountAll({
    where,
    include: [
      { model: Employee,  as: 'employee', attributes: ['id','first_name','last_name','employee_number'] },
      { model: LeaveType, as: 'leaveType', attributes: ['id','name','name_ar'] },
    ],
    order: [['created_at','DESC']],
    ...paginate(page, limit),
  });
  return paginateResult(rows, count, page, limit);
}

async function getRequest(id, company_id, user = null) {
  const req = await LeaveRequest.findOne({
    where: { id, company_id },
    include: [
      { model: Employee,  as: 'employee', attributes: ['id','first_name','last_name'] },
      { model: LeaveType, as: 'leaveType' },
    ],
  });
  if (!req) throw notFound('LeaveRequest', id);
  const role = (user?.role || '').toString().toUpperCase();
  const privileged = ['ADMIN', 'HR', 'SUPER_ADMIN'].includes(role);
  if (!privileged && user?.employee_id && Number(req.employee_id) !== Number(user.employee_id)) {
    throw forbidden('You can only view your own leave requests');
  }
  return req;
}

/** Inclusive calendar days between two YYYY-MM-DD strings (avoids timezone drift). */
function inclusiveLeaveDays(startDateStr, endDateStr) {
  const [ys, ms, ds] = String(startDateStr).split('-').map(Number);
  const [ye, me, de] = String(endDateStr).split('-').map(Number);
  const s = Date.UTC(ys, ms - 1, ds);
  const e = Date.UTC(ye, me - 1, de);
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 1;
  return Math.floor((e - s) / 86400000) + 1;
}

async function createRequest(company_id, employee_id, data) {
  const lt = await LeaveType.findOne({ where: { id: data.leave_type_id, company_id, is_active: 1 } });
  if (!lt) throw badReq('Leave type not found or inactive');

  const total_days = inclusiveLeaveDays(data.start_date, data.end_date);

  // Check balance has enough remaining days for this year
  const y = parseInt(String(data.start_date).slice(0, 4), 10);
  const year = Number.isFinite(y) ? y : Number(ymdInTimeZone(DEFAULT_IANA).slice(0, 4));
  if (lt.max_days_per_year > 0) {
    const [bal] = await LeaveBalance.findOrCreate({
      where: { company_id, employee_id, leave_type_id: data.leave_type_id, year },
      defaults: {
        company_id,
        employee_id,
        leave_type_id: data.leave_type_id,
        year,
        total_days: lt.max_days_per_year,
        used_days: 0,
        pending_days: 0,
      },
    });
    const remaining = Number(bal.total_days) - Number(bal.used_days) - Number(bal.pending_days);
    if (remaining < total_days) {
      throw badReq(`Insufficient leave balance (remaining: ${remaining})`);
    }
  }

  const payload = { ...data, total_days, company_id, employee_id };
  const req = await LeaveRequest.create(payload);

  // Increment pending_days in balance
  await LeaveBalance.increment('pending_days', {
    by   : total_days,
    where: { company_id, employee_id, leave_type_id: data.leave_type_id, year },
  });

  return req;
}

async function reviewRequest(id, company_id, approved_by, { status, rejection_reason }) {
  const req = await LeaveRequest.findOne({ where: { id, company_id } });
  if (!req) throw notFound('LeaveRequest', id);
  if (req.status !== 'PENDING') throw badReq('Request is no longer pending');

  const year = new Date(req.start_date).getFullYear();
  const updates = { status, approved_by, approved_at: new Date(), rejection_reason: rejection_reason || null };
  await req.update(updates);

  if (status === 'APPROVED') {
    // pending → used
    await LeaveBalance.increment('used_days',    { by: Number(req.total_days), where: { company_id, employee_id: req.employee_id, leave_type_id: req.leave_type_id, year } });
    await LeaveBalance.increment('pending_days', { by: -Number(req.total_days), where: { company_id, employee_id: req.employee_id, leave_type_id: req.leave_type_id, year } });
  } else {
    // rejected — remove pending
    await LeaveBalance.increment('pending_days', { by: -Number(req.total_days), where: { company_id, employee_id: req.employee_id, leave_type_id: req.leave_type_id, year } });
  }

  return req.reload();
}

async function cancelRequest(id, company_id, requestingUser) {
  const req = await LeaveRequest.findOne({ where: { id, company_id } });
  if (!req) throw notFound('LeaveRequest', id);

  // Only owner or admin can cancel
  const isOwner = requestingUser.employee_id === req.employee_id;
  const isAdmin = ['ADMIN','HR','SUPER_ADMIN'].includes(requestingUser.role || '');
  if (!isOwner && !isAdmin) throw forbidden('Cannot cancel another employee\'s leave request');
  if (!['PENDING','APPROVED'].includes(req.status)) throw badReq('Request cannot be cancelled in its current state');

  const wasApproved = req.status === 'APPROVED';
  await req.update({ status: 'CANCELLED' });

  const year = new Date(req.start_date).getFullYear();
  if (wasApproved) {
    await LeaveBalance.increment('used_days', { by: -Number(req.total_days), where: { company_id, employee_id: req.employee_id, leave_type_id: req.leave_type_id, year } });
  } else {
    await LeaveBalance.increment('pending_days', { by: -Number(req.total_days), where: { company_id, employee_id: req.employee_id, leave_type_id: req.leave_type_id, year } });
  }
  return req.reload();
}

module.exports = {
  listTypes, createType, updateType, deactivateType,
  listBalances, setBalance,
  listRequests, getRequest, createRequest, reviewRequest, cancelRequest,
};

