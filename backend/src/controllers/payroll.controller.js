'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/response');
const {
  salaryComponentSchema, salaryComponentUpdateSchema,
  empComponentSchema, payrollRunCreateSchema, payrollRunStatusSchema,
  payrollListSchema, payrollEngineConfigSchema,
} = require('../utils/validators');
const svc = require('../services/payroll.service');

// ── Helpers ───────────────────────────────────────────────────────────────────

const resolveCompanyId = (req, res) => {
  if (req.user.company_id !== null && req.user.company_id !== undefined) return req.user.company_id;

  const raw = req.query.company_id ?? req.body?.company_id ?? null;
  const id = Number(raw);

  if (!Number.isInteger(id) || id < 1) {
    sendError(res, 'company_id is required for super admin', 422, 'VALIDATION_ERROR');
    return null;
  }

  return id;
};

const parseId = (req, res, name = 'id') => {
  const id = Number(req.params[name]);
  if (!Number.isInteger(id) || id < 1) {
    sendError(res, `Invalid ${name} parameter`, 400, 'VALIDATION_ERROR');
    return null;
  }
  return id;
};

// ── Salary Components ─────────────────────────────────────────────────────────────────────

exports.listComponents = asyncHandler(async (req, res) => {
  const activeOnly = req.query.all !== '1';
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  const data = await svc.listComponents(companyId, activeOnly);
  sendSuccess(res, data);
});

exports.createComponent = asyncHandler(async (req, res) => {
  const parsed = salaryComponentSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.issues[0].message, 422, 'VALIDATION_ERROR');
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  const sc = await svc.createComponent(companyId, parsed.data);
  sendSuccess(res, sc, 'Salary component created', 201);
});

exports.updateComponent = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (!id) return;
  const parsed = salaryComponentUpdateSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.issues[0].message, 422, 'VALIDATION_ERROR');
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  const sc = await svc.updateComponent(id, companyId, parsed.data);
  sendSuccess(res, sc, 'Salary component updated');
});

// ── Employee Components ────────────────────────────────────────────────────────────────────

exports.listEmpComponents = asyncHandler(async (req, res) => {
  const employee_id = Number(req.params.employee_id);
  if (!Number.isInteger(employee_id) || employee_id < 1)
    return sendError(res, 'Invalid employee_id', 400, 'VALIDATION_ERROR');
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  const data = await svc.listEmployeeComponents(companyId, employee_id);
  sendSuccess(res, data);
});

exports.assignEmpComponent = asyncHandler(async (req, res) => {
  const parsed = empComponentSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.issues[0].message, 422, 'VALIDATION_ERROR');
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  const ec = await svc.assignEmployeeComponent(companyId, parsed.data);
  sendSuccess(res, ec, 'Component assigned to employee', 201);
});

exports.removeEmpComponent = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (!id) return;
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  await svc.removeEmployeeComponent(id, companyId);
  sendSuccess(res, null, 'Employee component removed');
});

// ── Payroll Runs ──────────────────────────────────────────────────────────────────────────────

exports.listRuns = asyncHandler(async (req, res) => {
  const parsed = payrollListSchema.safeParse(req.query);
  if (!parsed.success) return sendError(res, parsed.error.issues[0].message, 422, 'VALIDATION_ERROR');
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  const data = await svc.listRuns(companyId, parsed.data);
  sendSuccess(res, data);
});

exports.getRun = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (!id) return;
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  const run = await svc.getRunById(id, companyId);
  sendSuccess(res, run);
});

exports.createRun = asyncHandler(async (req, res) => {
  const parsed = payrollRunCreateSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.issues[0].message, 422, 'VALIDATION_ERROR');
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  const run = await svc.createRun(companyId, parsed.data, req.user.sub);
  sendSuccess(res, run, 'Payroll run created', 201);
});

exports.processRun = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (!id) return;
  // Optional engine tuning (overtime_multiplier, standard_hours_per_day)
  const cfgParsed = payrollEngineConfigSchema.safeParse(req.body ?? {});
  if (!cfgParsed.success) return sendError(res, cfgParsed.error.issues[0].message, 422, 'VALIDATION_ERROR');
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  const run = await svc.processRun(id, companyId, req.user.sub, cfgParsed.data);
  sendSuccess(res, run, 'Payroll run processed');
});

exports.updateRunStatus = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (!id) return;
  const parsed = payrollRunStatusSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.issues[0].message, 422, 'VALIDATION_ERROR');
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  const run = await svc.updateRunStatus(id, companyId, parsed.data);
  sendSuccess(res, run, 'Payroll run status updated');
});

exports.deleteRun = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (!id) return;
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  await svc.deleteRun(id, companyId);
  sendSuccess(res, null, 'Payroll run deleted');
});

// ── Payroll Items (payslips) ───────────────────────────────────────────────────────────────────

exports.listItems = asyncHandler(async (req, res) => {
  const run_id = parseId(req, res, 'run_id'); if (!run_id) return;
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  const data = await svc.listItems(companyId, run_id);
  sendSuccess(res, data);
});

exports.getItem = asyncHandler(async (req, res) => {
  const run_id = parseId(req, res, 'run_id'); if (!run_id) return;
  const id = parseId(req, res); if (!id) return;
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  const item = await svc.getItem(companyId, run_id, id);
  sendSuccess(res, item);
});

