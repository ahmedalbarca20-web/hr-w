'use strict';

/**
 * Department Service
 * All queries scoped by company_id.
 */

const { Department, Employee } = require('../models/index');
const { paginate, paginateResult } = require('../utils/pagination');

// ── Helpers ────────────────────────────────────────────────────────────────

const notFound = (id) => {
  const err = new Error(`Department #${id} not found`);
  err.statusCode = 404;
  err.code = 'NOT_FOUND';
  throw err;
};

const managerInclude = {
  model      : Employee,
  as         : 'manager',
  attributes : ['id', 'first_name', 'last_name', 'employee_number'],
  required   : false,
};

const parentInclude = {
  model      : Department,
  as         : 'parent',
  attributes : ['id', 'name', 'name_ar'],
  required   : false,
};

// ── CRUD ────────────────────────────────────────────────────────────────────

const list = async (company_id, filters = {}) => {
  const { page = 1, limit = 50 } = filters;
  const { offset } = paginate(page, limit);
  const where = { company_id };
  if (filters.is_active !== undefined) where.is_active = filters.is_active;

  const { rows, count } = await Department.findAndCountAll({
    where,
    include : [managerInclude, parentInclude],
    order   : [['name', 'ASC']],
    limit,
    offset,
  });

  return paginateResult(rows, count, page, limit);
};

const getById = async (id, company_id) => {
  const dept = await Department.findOne({
    where   : { id, company_id },
    include : [managerInclude, parentInclude],
  });
  if (!dept) notFound(id);
  return dept;
};

const create = async (company_id, data) => {
  // Validate parent belongs to the same company
  if (data.parent_id) {
    const parent = await Department.findOne({ where: { id: data.parent_id, company_id } });
    if (!parent) {
      const err = new Error(`Parent department #${data.parent_id} not found in this company`);
      err.statusCode = 422; err.code = 'VALIDATION_ERROR'; throw err;
    }
  }

  // Validate manager belongs to the same company
  if (data.manager_id) {
    const mgr = await Employee.findOne({ where: { id: data.manager_id, company_id, deleted_at: null } });
    if (!mgr) {
      const err = new Error(`Manager employee #${data.manager_id} not found in this company`);
      err.statusCode = 422; err.code = 'VALIDATION_ERROR'; throw err;
    }
  }

  return Department.create({ ...data, company_id });
};

const update = async (id, company_id, data) => {
  const dept = await getById(id, company_id);

  if (data.parent_id && data.parent_id !== dept.parent_id) {
    // Prevent setting itself as parent
    if (data.parent_id === id) {
      const err = new Error('A department cannot be its own parent');
      err.statusCode = 422; err.code = 'VALIDATION_ERROR'; throw err;
    }
    const parent = await Department.findOne({ where: { id: data.parent_id, company_id } });
    if (!parent) {
      const err = new Error(`Parent department #${data.parent_id} not found in this company`);
      err.statusCode = 422; err.code = 'VALIDATION_ERROR'; throw err;
    }
  }

  if (data.manager_id && data.manager_id !== dept.manager_id) {
    const mgr = await Employee.findOne({ where: { id: data.manager_id, company_id, deleted_at: null } });
    if (!mgr) {
      const err = new Error(`Manager employee #${data.manager_id} not found in this company`);
      err.statusCode = 422; err.code = 'VALIDATION_ERROR'; throw err;
    }
  }

  await dept.update(data);
  return dept.reload({ include: [managerInclude, parentInclude] });
};

const remove = async (id, company_id) => {
  const dept = await getById(id, company_id);

  // Check no active employees are assigned
  const activeCount = await Employee.count({
    where: { department_id: id, company_id, deleted_at: null },
  });
  if (activeCount > 0) {
    const err = new Error(
      `Cannot delete department with ${activeCount} active employee(s). Reassign them first.`
    );
    err.statusCode = 409; err.code = 'CONFLICT'; throw err;
  }

  await dept.destroy();
};

module.exports = { list, getById, create, update, remove };
