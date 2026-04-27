'use strict';

/**
 * Employee Service
 *
 * All queries are scoped by company_id to enforce tenant isolation.
 * Super-admin callers pass company_id = null which bypasses scoping
 * (handled by the controller before calling this service).
 *
 * Soft-delete pattern:
 *   - Employee model defaultScope excludes deleted_at IS NOT NULL rows.
 *   - softDelete() sets deleted_at instead of running a DELETE statement.
 */

const crypto       = require('crypto');
const { Op }       = require('sequelize');
const { Employee, Department, WorkShift } = require('../models/index');
const { sequelize } = require('../config/db');
const { paginate, paginateResult } = require('../utils/pagination');
const { ymdInTimeZone, DEFAULT_IANA } = require('../utils/timezone');

// ── Private helpers ───────────────────────────────────────────────────────────

const companyScope = (company_id, extra = {}) => ({ company_id, deleted_at: null, ...extra });

const notFound = (id) => {
  const err = new Error(`Employee #${id} not found`);
  err.statusCode = 404;
  err.code = 'NOT_FOUND';
  throw err;
};

const conflict = (msg) => {
  const err = new Error(msg);
  err.statusCode = 409;
  err.code = 'CONFLICT';
  throw err;
};

const badReq = (msg) => {
  const err = new Error(msg);
  err.statusCode = 400;
  err.code = 'VALIDATION_ERROR';
  throw err;
};

const shiftAttrs = [
  'id', 'name', 'name_ar', 'shift_start', 'shift_end', 'standard_hours', 'grace_minutes',
  'overtime_threshold_minutes', 'break_start', 'break_end', 'work_days', 'week_starts_on', 'holidays',
];
let cachedShiftAttrs = null;

const getShiftAttrs = async () => {
  if (cachedShiftAttrs) return cachedShiftAttrs;
  try {
    const cols = await sequelize.getQueryInterface().describeTable('work_shifts');
    const existing = Object.keys(cols || {});
    cachedShiftAttrs = shiftAttrs.filter((a) => existing.includes(a));
    if (cachedShiftAttrs.length === 0) cachedShiftAttrs = ['id', 'name', 'name_ar', 'shift_start', 'shift_end'];
  } catch {
    // If table metadata is unavailable, keep a safe minimal subset.
    cachedShiftAttrs = ['id', 'name', 'name_ar', 'shift_start', 'shift_end'];
  }
  return cachedShiftAttrs;
};

const getDefaultIncludes = async () => ([
  { model: Department, as: 'department', attributes: ['id', 'name', 'name_ar'], required: false },
  { model: WorkShift, as: 'shift', attributes: await getShiftAttrs(), required: false },
]);

const normalizeBiometricNumber = (v) => String(v || '').trim().toUpperCase();

/**
 * DB unique index is on (company_id, employee_number) for ALL rows.
 * Soft-deleted employees still block the same number — rename their number so it can be reused.
 */
async function reclaimEmployeeNumberForCompany(company_id, employee_number) {
  if (!employee_number) return;
  const dup = await Employee.unscoped().findOne({
    where: {
      company_id,
      employee_number,
      deleted_at: { [Op.ne]: null },
    },
  });
  if (!dup) return;
  let tomb;
  for (let i = 0; i < 6; i++) {
    const suf = crypto.randomBytes(3).toString('hex').toUpperCase();
    tomb = `DEL-${dup.id}-${suf}`.slice(0, 30);
    const clash = await Employee.unscoped().findOne({ where: { company_id, employee_number: tomb } });
    if (!clash) break;
  }
  await dup.update({ employee_number: tomb });
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

const list = async (company_id, filters = {}) => {
  const {
    page = 1, limit = 20,
    status, department_id,
    search, sort_by = 'created_at', sort_dir = 'DESC',
  } = filters;

  const where = companyScope(company_id);
  if (status)        where.status        = status;
  if (department_id) where.department_id = department_id;

  if (search) {
    const like = { [Op.like]: `%${search}%` };
    where[Op.or] = [
      { first_name      : like },
      { last_name       : like },
      { first_name_ar   : like },
      { last_name_ar    : like },
      { employee_number : like },
      { email           : like },
      { phone           : like },
    ];
  }

  const { offset } = paginate(page, limit);
  const { rows, count } = await Employee.findAndCountAll({
    where,
    include    : await getDefaultIncludes(),
    order      : [[sort_by, sort_dir.toUpperCase()]],
    limit,
    offset,
    attributes : { exclude: ['bank_account', 'iban'] },
  });

  return paginateResult(rows, count, page, limit);
};

const getById = async (id, company_id) => {
  const employee = await Employee.findOne({
    where   : companyScope(company_id, { id }),
    include : await getDefaultIncludes(),
  });
  if (!employee) notFound(id);
  return employee;
};

const create = async (company_id, data) => {
  data.employee_number = normalizeBiometricNumber(data.employee_number);
  await reclaimEmployeeNumberForCompany(company_id, data.employee_number);

  const existing = await Employee.findOne({
    where: { company_id, employee_number: data.employee_number, deleted_at: null },
  });
  if (existing) conflict(`Employee number '${data.employee_number}' already exists in this company`);

  if (data.department_id) {
    const dept = await Department.findOne({ where: { id: data.department_id, company_id } });
    if (!dept) {
      const err = new Error(`Department #${data.department_id} not found in this company`);
      err.statusCode = 422; err.code = 'VALIDATION_ERROR'; throw err;
    }
  }

  if (data.shift_id) {
    const shift = await WorkShift.findOne({ where: { id: data.shift_id, company_id } });
    if (!shift) {
      const err = new Error(`Shift #${data.shift_id} not found in this company`);
      err.statusCode = 422; err.code = 'VALIDATION_ERROR'; throw err;
    }
  }

  try {
    return await Employee.create({ ...data, company_id });
  } catch (e) {
    if (e?.name === 'SequelizeUniqueConstraintError') {
      conflict(`Employee number '${data.employee_number}' already exists in this company`);
    }
    throw e;
  }
};

const update = async (id, company_id, data) => {
  const employee = await getById(id, company_id);

  if (data.employee_number !== undefined) {
    data.employee_number = normalizeBiometricNumber(data.employee_number);
  }

  if (data.employee_number && data.employee_number !== employee.employee_number) {
    const dup = await Employee.findOne({
      where: { company_id, employee_number: data.employee_number, deleted_at: null },
    });
    if (dup) conflict(`Employee number '${data.employee_number}' already exists in this company`);
  }

  if (data.department_id && data.department_id !== employee.department_id) {
    const dept = await Department.findOne({ where: { id: data.department_id, company_id } });
    if (!dept) {
      const err = new Error(`Department #${data.department_id} not found in this company`);
      err.statusCode = 422; err.code = 'VALIDATION_ERROR'; throw err;
    }
  }

  if (data.shift_id && data.shift_id !== employee.shift_id) {
    const shift = await WorkShift.findOne({ where: { id: data.shift_id, company_id } });
    if (!shift) {
      const err = new Error(`Shift #${data.shift_id} not found in this company`);
      err.statusCode = 422; err.code = 'VALIDATION_ERROR'; throw err;
    }
  }

  await employee.update(data);
  return employee.reload({ include: await getDefaultIncludes() });
};

const changeStatus = async (id, company_id, status, termination_date = null) => {
  const employee = await getById(id, company_id);
  const patch    = { status };

  if (status === 'TERMINATED') {
    patch.termination_date = termination_date || new Date().toISOString().split('T')[0];
  } else {
    patch.termination_date = null;
  }

  await employee.update(patch);
  return employee.reload({ include: await getDefaultIncludes() });
};

const softDelete = async (id, company_id) => {
  const employee = await getById(id, company_id);
  await employee.update({ deleted_at: new Date() });
};

/** Map ZK `getUsers()` row → employee_number + display names (cardno / userId / uid). */
function buildPayloadFromZkUser(u) {
  const userId = String(u.userId != null ? u.userId : '').trim();
  const cardNum = u.cardno != null ? Number(u.cardno) : 0;
  const card = cardNum > 0 ? String(Math.trunc(cardNum)) : '';
  const employee_number = normalizeBiometricNumber(userId || card || String(u.uid ?? ''));
  if (!employee_number) badReq('Could not derive employee number from device user');

  const rawName = String(u.name || '').trim() || employee_number;
  const parts = rawName.split(/\s+/).filter(Boolean);
  const first_name = (parts[0] || employee_number).slice(0, 80);
  const last_name = (parts.length > 1 ? parts.slice(1).join(' ') : '-').slice(0, 80);

  return {
    employee_number,
    first_name,
    last_name,
    first_name_ar: first_name,
    last_name_ar: last_name,
    hire_date: ymdInTimeZone(DEFAULT_IANA),
    status: 'ACTIVE',
    contract_type: 'FULL_TIME',
    gender: 'MALE',
    base_salary: 0,
  };
}

/**
 * Create or update HR employee from one ZK device user row (Sync Center import).
 */
async function upsertFromZkUser(company_id, u) {
  const payload = buildPayloadFromZkUser(u);
  const existing = await Employee.findOne({
    where: { company_id, employee_number: payload.employee_number, deleted_at: null },
  });
  if (existing) {
    await existing.update({
      first_name    : payload.first_name,
      last_name     : payload.last_name,
      first_name_ar : payload.first_name_ar,
      last_name_ar  : payload.last_name_ar,
    });
    return {
      action          : 'updated',
      employee_id     : existing.id,
      employee_number : payload.employee_number,
      uid             : u.uid,
    };
  }
  const row = await create(company_id, payload);
  return {
    action          : 'created',
    employee_id     : row.id,
    employee_number : row.employee_number,
    uid             : u.uid,
  };
}

module.exports = {
  list, getById, create, update, changeStatus, softDelete, reclaimEmployeeNumberForCompany, upsertFromZkUser,
};

