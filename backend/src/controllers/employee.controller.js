'use strict';

/**
 * Employee Controller
 *
 * GET    /employees            — list (paginated, filterable)
 * POST   /employees            — create
 * GET    /employees/:id        — get one
 * PUT    /employees/:id        — full update
 * PATCH  /employees/:id        — partial update
 * PATCH  /employees/:id/status — change status only
 * DELETE /employees/:id        — soft-delete
 */

const employeeService = require('../services/employee.service');
const { sendSuccess, sendError, ERROR_CODES } = require('../utils/response');
const {
  employeeCreateSchema,
  employeeUpdateSchema,
  employeeStatusSchema,
  employeeListSchema,
  zId,
} = require('../utils/validators');

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Every handler reads company_id from the JWT payload.
 * Super-admin may override it by passing company_id in the query/body;
 * for normal users any such override is ignored.
 */
const resolveCompanyId = (req) => {
  if (req.user.is_super_admin) {
    const fromQuery = req.query.company_id ? parseInt(req.query.company_id, 10) : null;
    const fromBody = req.body?.company_id ? parseInt(req.body.company_id, 10) : null;
    return fromQuery || fromBody || req.user.company_id || null;
  }
  return req.user.company_id;
};

const ensureCompanyContext = (req, res, company_id) => {
  if (company_id && !Number.isNaN(Number(company_id))) return true;
  return sendError(res, 'company_id is required for super admin in employee operations', 422, ERROR_CODES.VALIDATION_ERROR);
};

const parseId = (req, res) => {
  const parsed = zId.safeParse(req.params.id);
  if (!parsed.success) {
    sendError(res, 'Invalid employee id', 400, ERROR_CODES.VALIDATION_ERROR);
    return null;
  }
  return parsed.data;
};

/**
 * Backward-compatible payload normalization:
 * - employee_code      -> employee_number
 * - biometric_number   -> employee_number
 */
const normalizeEmployeePayload = (payload = {}) => {
  const normalized = { ...payload };
  const code = normalized.employee_number ?? normalized.employee_code ?? normalized.biometric_number;
  if (code !== undefined) normalized.employee_number = code;
  delete normalized.employee_code;
  delete normalized.biometric_number;
  return normalized;
};

// ── Handlers ─────────────────────────────────────────────────────────────────

/** GET /employees */
const list = async (req, res) => {
  const company_id = resolveCompanyId(req);
  if (!ensureCompanyContext(req, res, company_id)) return;

  const parsed = employeeListSchema.safeParse(req.query);
  if (!parsed.success) {
    return sendError(
      res,
      parsed.error.errors.map((e) => e.message).join(', '),
      422,
      ERROR_CODES.VALIDATION_ERROR
    );
  }

  const result = await employeeService.list(company_id, parsed.data);
  return sendSuccess(res, result);
};

/** GET /employees/me — current user's employee row (no `employees` feature required). */
const getSelf = async (req, res) => {
  if (!req.user.employee_id) {
    return sendError(res, 'No employee record linked to this account', 404, ERROR_CODES.NOT_FOUND);
  }
  const company_id = resolveCompanyId(req);
  if (!ensureCompanyContext(req, res, company_id)) return;
  if (company_id == null || Number.isNaN(Number(company_id))) {
    return sendError(res, 'Company context required', 400, ERROR_CODES.VALIDATION_ERROR);
  }
  const employee = await employeeService.getById(req.user.employee_id, company_id);
  return sendSuccess(res, employee);
};

/** GET /employees/:id */
const getOne = async (req, res) => {
  const id         = parseId(req, res); if (!id) return;
  const company_id = resolveCompanyId(req);
  if (!ensureCompanyContext(req, res, company_id)) return;
  const role = (req.user.role || '').toString().toUpperCase();
  const privileged = ['ADMIN', 'HR', 'SUPER_ADMIN'].includes(role) || req.user.is_super_admin;
  if (!privileged && id !== req.user.employee_id) {
    return sendError(res, 'You can only view your own employee profile', 403, ERROR_CODES.FORBIDDEN);
  }
  const employee = await employeeService.getById(id, company_id);
  return sendSuccess(res, employee);
};

/** POST /employees */
const create = async (req, res) => {
  const company_id = resolveCompanyId(req);
  if (!ensureCompanyContext(req, res, company_id)) return;
  const parsed = employeeCreateSchema.safeParse(normalizeEmployeePayload(req.body));
  if (!parsed.success) {
    return sendError(
      res,
      parsed.error.errors.map((e) => e.message).join(', '),
      422,
      ERROR_CODES.VALIDATION_ERROR
    );
  }

  const employee = await employeeService.create(company_id, parsed.data);
  return sendSuccess(res, employee, 'Employee created successfully', 201);
};

/** PUT /employees/:id  (full update) */
const update = async (req, res) => {
  const id         = parseId(req, res); if (!id) return;
  const company_id = resolveCompanyId(req);
  if (!ensureCompanyContext(req, res, company_id)) return;

  const parsed = employeeCreateSchema.safeParse(normalizeEmployeePayload(req.body));
  if (!parsed.success) {
    return sendError(
      res,
      parsed.error.errors.map((e) => e.message).join(', '),
      422,
      ERROR_CODES.VALIDATION_ERROR
    );
  }

  const employee = await employeeService.update(id, company_id, parsed.data);
  return sendSuccess(res, employee, 'Employee updated successfully');
};

/** PATCH /employees/:id  (partial update) */
const patch = async (req, res) => {
  const id         = parseId(req, res); if (!id) return;
  const company_id = resolveCompanyId(req);
  if (!ensureCompanyContext(req, res, company_id)) return;

  const parsed = employeeUpdateSchema.safeParse(normalizeEmployeePayload(req.body));
  if (!parsed.success) {
    return sendError(
      res,
      parsed.error.errors.map((e) => e.message).join(', '),
      422,
      ERROR_CODES.VALIDATION_ERROR
    );
  }

  if (Object.keys(parsed.data).length === 0) {
    return sendError(res, 'Request body must contain at least one field to update', 422, ERROR_CODES.VALIDATION_ERROR);
  }

  const employee = await employeeService.update(id, company_id, parsed.data);
  return sendSuccess(res, employee, 'Employee updated successfully');
};

/** PATCH /employees/:id/status */
const changeStatus = async (req, res) => {
  const id         = parseId(req, res); if (!id) return;
  const company_id = resolveCompanyId(req);
  if (!ensureCompanyContext(req, res, company_id)) return;

  const parsed = employeeStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(
      res,
      parsed.error.errors.map((e) => e.message).join(', '),
      422,
      ERROR_CODES.VALIDATION_ERROR
    );
  }

  const employee = await employeeService.changeStatus(
    id,
    company_id,
    parsed.data.status,
    parsed.data.termination_date || null
  );
  return sendSuccess(res, employee, `Status changed to ${parsed.data.status}`);
};

/** DELETE /employees/:id  (soft-delete) */
const remove = async (req, res) => {
  const id         = parseId(req, res); if (!id) return;
  const company_id = resolveCompanyId(req);
  if (!ensureCompanyContext(req, res, company_id)) return;
  await employeeService.softDelete(id, company_id);
  return sendSuccess(res, null, 'Employee deleted successfully');
};

module.exports = { list, getSelf, getOne, create, update, patch, changeStatus, remove };

