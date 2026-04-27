'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/response');
const {
  leaveTypeCreateSchema, leaveTypeUpdateSchema,
  leaveBalanceSchema, leaveRequestCreateSchema, leaveRequestReviewSchema,
  leaveListSchema,
} = require('../utils/validators');
const svc = require('../services/leave.service');

// ── Helpers ───────────────────────────────────────────────────────────────────

const resolveCompanyId = (req, res) => {
  if (req.user.company_id !== null && req.user.company_id !== undefined) return req.user.company_id;

  const raw = req.query.company_id ?? req.body?.company_id ?? null;
  const companyId = Number(raw);
  if (!Number.isInteger(companyId) || companyId < 1) {
    sendError(res, 'company_id is required for super admin', 422, 'VALIDATION_ERROR');
    return null;
  }

  return companyId;
};

const parseId = (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    sendError(res, 'Invalid id parameter', 400, 'VALIDATION_ERROR');
    return null;
  }
  return id;
};

// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// LEAVE TYPES
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

exports.listTypes = asyncHandler(async (req, res) => {
  const activeOnly = req.query.all !== '1';
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  const data = await svc.listTypes(companyId, activeOnly);
  sendSuccess(res, data);
});

exports.createType = asyncHandler(async (req, res) => {
  const parsed = leaveTypeCreateSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.issues[0].message, 422, 'VALIDATION_ERROR');
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  const lt = await svc.createType(companyId, parsed.data);
  sendSuccess(res, lt, 'Leave type created', 201);
});

exports.updateType = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (!id) return;
  const parsed = leaveTypeUpdateSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.issues[0].message, 422, 'VALIDATION_ERROR');
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  const lt = await svc.updateType(id, companyId, parsed.data);
  sendSuccess(res, lt, 'Leave type updated');
});

exports.deactivateType = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (!id) return;
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  const lt = await svc.deactivateType(id, companyId);
  sendSuccess(res, lt, 'Leave type deactivated');
});

// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// LEAVE BALANCES
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

exports.listBalances = asyncHandler(async (req, res) => {
  const { employee_id, leave_type_id, year } = req.query;
  const empId = employee_id ? Number(employee_id) : undefined;
  // Employees can only see their own balance
  const resolvedEmpId = ['ADMIN','HR','SUPER_ADMIN'].includes(req.user.role || '')
    ? empId
    : req.user.employee_id;
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  const data = await svc.listBalances(companyId, {
    employee_id: resolvedEmpId, leave_type_id: leave_type_id ? Number(leave_type_id) : undefined,
    year: year ? Number(year) : undefined,
  });
  sendSuccess(res, data);
});

exports.setBalance = asyncHandler(async (req, res) => {
  const parsed = leaveBalanceSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.issues[0].message, 422, 'VALIDATION_ERROR');
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  const bal = await svc.setBalance(companyId, parsed.data);
  sendSuccess(res, bal, 'Leave balance set', 201);
});

// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// LEAVE REQUESTS
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

exports.listRequests = asyncHandler(async (req, res) => {
  const parsed = leaveListSchema.safeParse(req.query);
  if (!parsed.success) return sendError(res, parsed.error.issues[0].message, 422, 'VALIDATION_ERROR');
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  const data = await svc.listRequests(companyId, req.user, parsed.data);
  sendSuccess(res, data);
});

exports.getRequest = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (!id) return;
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  const req2 = await svc.getRequest(id, companyId, req.user);
  sendSuccess(res, req2);
});

exports.createRequest = asyncHandler(async (req, res) => {
  const parsed = leaveRequestCreateSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.issues[0].message, 422, 'VALIDATION_ERROR');
  if (!req.user.employee_id) return sendError(res, 'No employee record linked to this account', 400, 'VALIDATION_ERROR');
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  const lr = await svc.createRequest(companyId, req.user.employee_id, parsed.data);
  sendSuccess(res, lr, 'Leave request submitted', 201);
});

exports.reviewRequest = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (!id) return;
  const parsed = leaveRequestReviewSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.issues[0].message, 422, 'VALIDATION_ERROR');
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  const lr = await svc.reviewRequest(id, companyId, req.user.sub, parsed.data);
  sendSuccess(res, lr, `Leave request ${parsed.data.status.toLowerCase()}`);
});

exports.cancelRequest = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (!id) return;
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  const lr = await svc.cancelRequest(id, companyId, req.user);
  sendSuccess(res, lr, 'Leave request cancelled');
});

