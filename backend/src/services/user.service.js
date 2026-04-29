'use strict';

const { Op }    = require('sequelize');
const User      = require('../models/user.model');
const Role      = require('../models/role.model');
const Employee  = require('../models/employee.model');
const Company   = require('../models/company.model');
const WorkShift = require('../models/work_shift.model');
const Department = require('../models/department.model');
const { hashPassword } = require('../utils/hash');
const { paginate, paginateResult } = require('../utils/pagination');
const { sequelize } = require('../config/db');
const employeeSvc = require('./employee.service');
const { ymdInTimeZone, DEFAULT_IANA } = require('../utils/timezone');

// ── Helpers ──────────────────────────────────────────────────────────────────

const notFound  = (id) => Object.assign(new Error(`User ${id} not found`), { statusCode: 404, code: 'NOT_FOUND' });
const conflict  = (msg) => Object.assign(new Error(msg), { statusCode: 409, code: 'CONFLICT' });
const badReq    = (msg) => Object.assign(new Error(msg), { statusCode: 400, code: 'VALIDATION_ERROR' });

async function assertEmailNotCompanyContact(company_id, email, currentUserId = null) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return;
  const company = await Company.findOne({ where: { id: company_id } });
  if (!company?.email) return;
  const companyEmail = String(company.email).trim().toLowerCase();
  if (!companyEmail || normalizedEmail !== companyEmail) return;
  if (currentUserId != null) {
    const sameUser = await User.findOne({ where: { id: currentUserId, email: normalizedEmail, company_id } });
    if (!sameUser) return;
  }
  throw conflict('Company contact email cannot be used as a user login email');
}

// ── List ─────────────────────────────────────────────────────────────────────

async function list(company_id, { page = 1, limit = 20, is_active, search } = {}) {
  const where = { company_id };
  if (is_active !== undefined) where.is_active = is_active;
  if (search) where.email = { [Op.like]: `%${search}%` };

  const { rows, count } = await User.findAndCountAll({
    where,
    attributes: { exclude: ['password_hash','refresh_token'] },
    include: [
      { model: Role,     as: 'role',     attributes: ['id','name','name_ar'] },
      { model: Employee, as: 'employee', attributes: ['id','first_name','last_name','employee_number'], required: false },
    ],
    order: [['created_at', 'DESC']],
    ...paginate(page, limit),
  });
  return paginateResult(rows, count, page, limit);
}

async function listRoles(company_id) {
  return Role.findAll({
    where: { company_id },
    attributes: ['id', 'name', 'name_ar'],
    order: [['id', 'ASC']],
  });
}

// ── Get one ──────────────────────────────────────────────────────────────────

async function getById(id, company_id) {
  const user = await User.findOne({
    where: { id, company_id },
    attributes: { exclude: ['password_hash','refresh_token'] },
    include: [
      { model: Role,     as: 'role' },
      { model: Employee, as: 'employee', required: false },
    ],
  });
  if (!user) throw notFound(id);
  return user;
}

// ── Create ───────────────────────────────────────────────────────────────────

async function create(company_id, data) {
  const normalizedEmail = data.email.trim().toLowerCase();

  // Email must be unique globally
  const existing = await User.findOne({ where: { email: normalizedEmail } });
  if (existing) throw conflict(`Email ${normalizedEmail} is already registered`);
  await assertEmailNotCompanyContact(company_id, normalizedEmail);

  // Validate role belongs to company
  const role = await Role.findOne({ where: { id: data.role_id, company_id } });
  if (!role) throw badReq('Role not found in this company');

  // Validate employee if provided
  if (data.employee_id) {
    const emp = await Employee.findOne({ where: { id: data.employee_id, company_id } });
    if (!emp) throw badReq('Employee not found in this company');
    // An employee can only have one user account
    const empUser = await User.findOne({ where: { employee_id: data.employee_id, company_id } });
    if (empUser) throw conflict('This employee already has a user account');
  }

  let autoEmployeePayload = null;
  if (!data.employee_id && data.auto_employee) {
    const employee_number = String(data.auto_employee.employee_number || '').trim().toUpperCase();
    await employeeSvc.reclaimEmployeeNumberForCompany(company_id, employee_number);
    const dupEmp = await Employee.findOne({ where: { company_id, employee_number, deleted_at: null } });
    if (dupEmp) throw conflict(`Employee number '${employee_number}' already exists in this company`);

    if (data.auto_employee.shift_id) {
      const shift = await WorkShift.findOne({ where: { id: data.auto_employee.shift_id, company_id } });
      if (!shift) throw badReq('Shift not found in this company');
    }
    if (data.auto_employee.department_id) {
      const dept = await Department.findOne({ where: { id: data.auto_employee.department_id, company_id } });
      if (!dept) throw badReq('Department not found in this company');
    }

    autoEmployeePayload = {
      company_id,
      employee_number,
      first_name: String(data.auto_employee.first_name || '').trim(),
      last_name: String(data.auto_employee.last_name || '').trim(),
      hire_date: data.auto_employee.hire_date || ymdInTimeZone(DEFAULT_IANA),
      shift_id: data.auto_employee.shift_id || null,
      department_id: data.auto_employee.department_id || null,
      base_salary: 0,
      status: 'ACTIVE',
      contract_type: 'FULL_TIME',
      gender: 'MALE',
    };
  }

  const password_hash = await hashPassword(data.password);
  const user = await sequelize.transaction(async (tx) => {
    let employee_id = data.employee_id || null;

    if (autoEmployeePayload) {
      const createdEmployee = await Employee.create(autoEmployeePayload, { transaction: tx });
      employee_id = createdEmployee.id;
    }

    return User.create({
      company_id,
      employee_id,
      role_id     : data.role_id,
      email       : normalizedEmail,
      password_hash,
      is_active   : data.is_active ?? 1,
    }, { transaction: tx });
  });
  return getById(user.id, company_id);
}

// ── Update ───────────────────────────────────────────────────────────────────

async function update(id, company_id, data) {
  const user = await User.findOne({ where: { id, company_id } });
  if (!user) throw notFound(id);

  if (data.email && data.email !== user.email) {
    const normalizedEmail = data.email.trim().toLowerCase();
    const dup = await User.findOne({ where: { email: normalizedEmail, id: { [Op.ne]: id } } });
    if (dup) throw conflict(`Email ${normalizedEmail} is already in use`);
    await assertEmailNotCompanyContact(company_id, normalizedEmail, id);
    data.email = normalizedEmail;
  }
  if (data.role_id) {
    const role = await Role.findOne({ where: { id: data.role_id, company_id } });
    if (!role) throw badReq('Role not found in this company');
  }
  if (data.employee_id !== undefined) {
    if (data.employee_id === null) {
      // allow unlinking from employee
    } else {
      const emp = await Employee.findOne({ where: { id: data.employee_id, company_id } });
      if (!emp) throw badReq('Employee not found in this company');
      const dupEmployeeLink = await User.findOne({
        where: { employee_id: data.employee_id, company_id, id: { [Op.ne]: id } },
      });
      if (dupEmployeeLink) throw conflict('This employee is already linked to another user');
    }
  }

  const updates = {};
  if (data.role_id   !== undefined) updates.role_id   = data.role_id;
  if (data.employee_id !== undefined) updates.employee_id = data.employee_id;
  if (data.email     !== undefined) updates.email     = data.email;
  if (data.is_active !== undefined) updates.is_active = data.is_active;
  if (data.password)                updates.password_hash = await hashPassword(data.password);

  await user.update(updates);
  return getById(id, company_id);
}

// ── Reset password ─────────────────────────────────────────────────────────

async function resetPassword(id, company_id, isSuperAdmin, password) {
  const where = (isSuperAdmin && !company_id) ? { id } : { id, company_id };
  const user = await User.findOne({ where });
  if (!user) throw notFound(id);

  const password_hash = await hashPassword(password);
  await user.update({ password_hash, refresh_token: null });
}

// ── Deactivate ───────────────────────────────────────────────────────────────

async function deactivate(id, company_id) {
  const user = await User.findOne({ where: { id, company_id } });
  if (!user) throw notFound(id);
  await user.update({ is_active: 0, refresh_token: null });
}

// ── Permanent delete (hard remove account) ───────────────────────────────────

async function permanentDelete(id, company_id, actingUserId) {
  if (Number(actingUserId) === Number(id)) {
    throw badReq('Cannot delete your own user account');
  }
  const user = await User.findOne({ where: { id, company_id } });
  if (!user) throw notFound(id);

  const adminRole = await Role.findOne({ where: { company_id, name: 'ADMIN' } });
  if (adminRole && Number(user.role_id) === Number(adminRole.id)) {
    const adminCount = await User.count({ where: { company_id, role_id: adminRole.id } });
    if (adminCount <= 1) {
      throw badReq('Cannot delete the last administrator account for this company');
    }
  }

  await user.destroy();
}

module.exports = {
  list,
  listRoles,
  getById,
  create,
  update,
  deactivate,
  resetPassword,
  permanentDelete,
};
