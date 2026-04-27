'use strict';

const { Op }      = require('sequelize');
const sequelize   = require('../config/db').sequelize;
const {
  SalaryComponent, EmployeeSalaryComponent,
  PayrollRun, PayrollItem, PayrollItemComponent,
} = require('../models/payroll.model');
const Employee = require('../models/employee.model');
const { paginate, paginateResult } = require('../utils/pagination');
const engine = require('./payroll_engine.service');

// ── Helpers ──────────────────────────────────────────────────────────────────

const notFound = (entity, id) =>
  Object.assign(new Error(`${entity} ${id} not found`), { statusCode: 404, code: 'NOT_FOUND' });
const badReq = (msg) =>
  Object.assign(new Error(msg), { statusCode: 400, code: 'VALIDATION_ERROR' });

// ════════════════════════════════════════════════════════════════
// SALARY COMPONENTS
// ════════════════════════════════════════════════════════════════

async function listComponents(company_id, activeOnly = true) {
  const where = { company_id };
  if (activeOnly) where.is_active = 1;
  return SalaryComponent.findAll({ where, order: [['type','ASC'],['name','ASC']] });
}

async function createComponent(company_id, data) {
  return SalaryComponent.create({ ...data, company_id });
}

async function updateComponent(id, company_id, data) {
  const sc = await SalaryComponent.findOne({ where: { id, company_id } });
  if (!sc) throw notFound('SalaryComponent', id);
  return sc.update(data);
}

// ── Employee-specific components ─────────────────────────────────────────────

async function listEmployeeComponents(company_id, employee_id) {
  return EmployeeSalaryComponent.findAll({
    where  : { company_id, employee_id },
    include: [{ model: SalaryComponent, as: 'component' }],
    order  : [['effective_from', 'DESC']],
  });
}

async function assignEmployeeComponent(company_id, data) {
  const emp = await Employee.findOne({ where: { id: data.employee_id, company_id } });
  if (!emp) throw badReq('Employee not found in this company');
  const sc = await SalaryComponent.findOne({ where: { id: data.component_id, company_id } });
  if (!sc) throw badReq('Salary component not found in this company');
  return EmployeeSalaryComponent.create({ ...data, company_id });
}

async function removeEmployeeComponent(id, company_id) {
  const row = await EmployeeSalaryComponent.findOne({ where: { id, company_id } });
  if (!row) throw notFound('EmployeeSalaryComponent', id);
  await row.destroy();
}

// ════════════════════════════════════════════════════════════════
// PAYROLL RUNS
// ════════════════════════════════════════════════════════════════

async function listRuns(company_id, { page = 1, limit = 20, status, year } = {}) {
  const where = { company_id };
  if (status) where.status   = status;
  if (year)   where.run_year = year;
  const { rows, count } = await PayrollRun.findAndCountAll({
    where, order: [['run_year','DESC'],['run_month','DESC']],
    ...paginate(page, limit),
  });
  return paginateResult(rows, count, page, limit);
}

async function getRunById(id, company_id) {
  const run = await PayrollRun.findOne({ where: { id, company_id } });
  if (!run) throw notFound('PayrollRun', id);
  return run;
}

async function createRun(company_id, data, processed_by) {
  const existing = await PayrollRun.findOne({
    where: { company_id, run_month: data.run_month, run_year: data.run_year },
  });
  if (existing) throw badReq(`Payroll run for ${data.run_year}-${String(data.run_month).padStart(2,'0')} already exists (status: ${existing.status})`);
  return PayrollRun.create({ ...data, company_id, processed_by, processed_at: new Date() });
}

async function processRun(id, company_id, processed_by, config = {}) {
  /**
   * Delegates entirely to the Payroll Engine.
   * The engine handles: attendance, leaves, overtime, deductions,
   * net_salary, and the frozen snapshot — see payroll_engine.service.js.
   */
  return engine.runPayrollEngine(id, company_id, processed_by, config);
}

async function updateRunStatus(id, company_id, { status, notes }) {
  const run = await PayrollRun.findOne({ where: { id, company_id } });
  if (!run) throw notFound('PayrollRun', id);
  const allowed = { APPROVED: ['PROCESSING'], PAID: ['APPROVED'], CANCELLED: ['DRAFT','PROCESSING','APPROVED'] };
  if (!(allowed[status] || []).includes(run.status)) {
    throw badReq(`Cannot transition run from ${run.status} to ${status}`);
  }
  return run.update({ status, notes: notes || run.notes, ...(status === 'APPROVED' ? { approved_at: new Date() } : {}) });
}

async function deleteRun(id, company_id) {
  const run = await PayrollRun.findOne({ where: { id, company_id } });
  if (!run) throw notFound('PayrollRun', id);
  if (run.status !== 'DRAFT') throw badReq('Only DRAFT runs can be deleted');
  await run.destroy();
}

// ── Payroll Items ─────────────────────────────────────────────────────────────

async function listItems(company_id, run_id) {
  const run = await PayrollRun.findOne({ where: { id: run_id, company_id } });
  if (!run) throw notFound('PayrollRun', run_id);
  return PayrollItem.findAll({
    where  : { company_id, payroll_run_id: run_id },
    include: [{ model: Employee, as: 'employee', attributes: ['id','first_name','last_name','employee_number'] }],
    order  : [['employee_id','ASC']],
  });
}

async function getItem(company_id, run_id, item_id) {
  const item = await PayrollItem.findOne({
    where  : { id: item_id, company_id, payroll_run_id: run_id },
    include: [
      { model: Employee,            as: 'employee', attributes: ['id','first_name','last_name','employee_number'] },
      { model: PayrollItemComponent, as: 'lineItems' },
    ],
  });
  if (!item) throw notFound('PayrollItem', item_id);
  return item;
}

module.exports = {
  listComponents, createComponent, updateComponent,
  listEmployeeComponents, assignEmployeeComponent, removeEmployeeComponent,
  listRuns, getRunById, createRun, processRun, updateRunStatus, deleteRun,
  listItems, getItem,
};

