'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/response');
const {
  attendanceCreateSchema, attendanceUpdateSchema, attendanceListSchema,
} = require('../utils/validators');
const svc = require('../services/attendance.service');
const surpriseSvc = require('../services/surprise_attendance.service');

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

const parseId = (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    sendError(res, 'Invalid id parameter', 400, 'VALIDATION_ERROR');
    return null;
  }
  return id;
};

// ── Handlers ──────────────────────────────────────────────────────────────────

exports.list = asyncHandler(async (req, res) => {
  const parsed = attendanceListSchema.safeParse(req.query);
  if (!parsed.success) return sendError(res, parsed.error.issues[0].message, 422, 'VALIDATION_ERROR');
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  const data = await svc.list(companyId, parsed.data, req.user);
  sendSuccess(res, data);
});

exports.getOne = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (!id) return;
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  const rec = await svc.getById(id, companyId, req.user);
  sendSuccess(res, rec);
});

exports.checkIn = asyncHandler(async (req, res) => {
  const { employee_id } = req.user;
  if (!employee_id) return sendError(res, 'No employee record linked to this account', 400, 'VALIDATION_ERROR');
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  const rec = await svc.checkIn(employee_id, companyId);
  sendSuccess(res, rec, 'Checked in successfully', 201);
});

exports.checkOut = asyncHandler(async (req, res) => {
  const { employee_id } = req.user;
  if (!employee_id) return sendError(res, 'No employee record linked to this account', 400, 'VALIDATION_ERROR');
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  const rec = await svc.checkOut(employee_id, companyId);
  sendSuccess(res, rec, 'Checked out successfully');
});

exports.create = asyncHandler(async (req, res) => {
  const parsed = attendanceCreateSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.issues[0].message, 422, 'VALIDATION_ERROR');
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  const rec = await svc.create(companyId, parsed.data, req.user.sub);
  sendSuccess(res, rec, 'Attendance record created', 201);
});

exports.update = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (!id) return;
  const parsed = attendanceUpdateSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.issues[0].message, 422, 'VALIDATION_ERROR');
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  const rec = await svc.update(id, companyId, parsed.data);
  sendSuccess(res, rec, 'Attendance record updated');
});

exports.remove = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (!id) return;
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  await svc.remove(id, companyId);
  sendSuccess(res, null, 'Attendance record deleted');
});

exports.summary = asyncHandler(async (req, res) => {
  const { year, month, employee_id } = req.query;
  const y = Number(year)  || new Date().getFullYear();
  const m = Number(month) || new Date().getMonth() + 1;
  const empId = employee_id ? Number(employee_id) : req.user.employee_id;
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  const data = await svc.monthlySummary(companyId, empId, y, m, req.user);
  sendSuccess(res, data);
});

exports.activeSurpriseAttendance = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  const active = await surpriseSvc.getActive(companyId);
  sendSuccess(res, active);
});

