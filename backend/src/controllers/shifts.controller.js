'use strict';

/**
 * Work Shifts Controller
 *
 * GET    /api/shifts              – list (HR+ADMIN)
 * POST   /api/shifts              – create (ADMIN)
 * GET    /api/shifts/:id          – get one (HR+ADMIN)
 * PUT    /api/shifts/:id          – update  (ADMIN)
 * DELETE /api/shifts/:id          – deactivate (ADMIN)
 * POST   /api/shifts/:id/set-default – set company default (ADMIN)
 */

const asyncHandler   = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/response');
const {
  workShiftCreateSchema,
  workShiftUpdateSchema,
  workShiftListSchema,
} = require('../utils/validators');
const svc = require('../services/attendance_processor.service');

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

// ── GET /api/shifts ──────────────────────────────────────────────────────────
exports.list = asyncHandler(async (req, res) => {
  const parsed = workShiftListSchema.safeParse(req.query);
  if (!parsed.success) return sendError(res, parsed.error.issues[0].message, 422, 'VALIDATION_ERROR');

  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  const shifts = await svc.listShifts(companyId, parsed.data);
  sendSuccess(res, shifts);
});

// ── GET /api/shifts/:id ──────────────────────────────────────────────────────
exports.getOne = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (!id) return;
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  const shift = await svc.getShift(id, companyId);
  sendSuccess(res, shift);
});

// ── POST /api/shifts ─────────────────────────────────────────────────────────
exports.create = asyncHandler(async (req, res) => {
  const parsed = workShiftCreateSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.issues[0].message, 422, 'VALIDATION_ERROR');

  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  const shift = await svc.createShift(companyId, parsed.data);
  sendSuccess(res, shift, 'Work shift created', 201);
});

// ── PUT /api/shifts/:id ──────────────────────────────────────────────────────
exports.update = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (!id) return;
  const parsed = workShiftUpdateSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.issues[0].message, 422, 'VALIDATION_ERROR');

  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  const shift = await svc.updateShift(id, companyId, parsed.data);
  sendSuccess(res, shift, 'Work shift updated');
});

// ── DELETE /api/shifts/:id ───────────────────────────────────────────────────
exports.deactivate = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (!id) return;
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  await svc.deactivateShift(id, companyId);
  sendSuccess(res, null, 'Work shift deactivated');
});

// ── POST /api/shifts/:id/set-default ────────────────────────────────────────
exports.setDefault = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (!id) return;
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  const shift = await svc.setDefaultShift(id, companyId);
  sendSuccess(res, shift, 'Default shift updated');
});
