'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/response');
const {
  attendanceRequestCreateSchema,
  attendanceRequestListSchema,
  attendanceRequestReviewSchema,
} = require('../utils/validators');
const svc = require('../services/attendance_request.service');

const resolveCompanyId = (req, res) => {
  if (req.user.company_id != null) return req.user.company_id;
  const id = Number(req.query.company_id ?? req.body?.company_id);
  if (!Number.isInteger(id) || id < 1) {
    sendError(res, 'company_id is required for super admin', 422, 'VALIDATION_ERROR');
    return null;
  }
  return id;
};

exports.createRequest = asyncHandler(async (req, res) => {
  const employee_id = req.user.employee_id;
  if (!employee_id) return sendError(res, 'No employee record linked to this account', 400, 'VALIDATION_ERROR');
  const parsed = attendanceRequestCreateSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.issues[0].message, 422, 'VALIDATION_ERROR');
  if (!req.file) return sendError(res, 'Photo is required', 422, 'VALIDATION_ERROR');

  const company_id = resolveCompanyId(req, res); if (!company_id) return;
  const photo_path = `uploads/attendance-requests/${req.file.filename}`;
  const row = await svc.submitRequest(company_id, employee_id, parsed.data, photo_path);
  sendSuccess(res, row, 'Attendance request submitted', 201);
});

exports.listRequests = asyncHandler(async (req, res) => {
  const parsed = attendanceRequestListSchema.safeParse(req.query);
  if (!parsed.success) return sendError(res, parsed.error.issues[0].message, 422, 'VALIDATION_ERROR');
  const company_id = resolveCompanyId(req, res); if (!company_id) return;
  const data = await svc.listRequests(company_id, req.user, parsed.data);
  sendSuccess(res, data);
});

exports.reviewRequest = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return sendError(res, 'Invalid id parameter', 400, 'VALIDATION_ERROR');
  const parsed = attendanceRequestReviewSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.issues[0].message, 422, 'VALIDATION_ERROR');
  const company_id = resolveCompanyId(req, res); if (!company_id) return;
  const row = await svc.reviewRequest(id, company_id, req.user.sub, parsed.data);
  sendSuccess(res, row, `Attendance request ${parsed.data.status.toLowerCase()}`);
});

