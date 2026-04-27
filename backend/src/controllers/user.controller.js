'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/response');
const {
  userCreateSchema, userUpdateSchema, userListSchema,
  announcementCreateSchema, announcementUpdateSchema,
} = require('../utils/validators');
const userSvc = require('../services/user.service');
const annSvc  = require('../services/announcement.service');

// ── Helpers ───────────────────────────────────────────────────────────────────

const resolveCompanyId = (req) => req.user.company_id ?? Number(req.query.company_id ?? req.body?.company_id);

const parseId = (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    sendError(res, 'Invalid id parameter', 400, 'VALIDATION_ERROR');
    return null;
  }
  return id;
};

// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// USER MANAGEMENT
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

exports.listUsers = asyncHandler(async (req, res) => {
  const parsed = userListSchema.safeParse(req.query);
  if (!parsed.success) return sendError(res, parsed.error.issues[0].message, 422, 'VALIDATION_ERROR');
  const companyId = resolveCompanyId(req);
  if (!companyId && req.user.is_super_admin) {
    return sendError(res, 'company_id is required for super admin', 422, 'VALIDATION_ERROR');
  }
  const data = await userSvc.list(companyId, parsed.data);
  sendSuccess(res, data);
});

exports.getUser = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (!id) return;
  const companyId = resolveCompanyId(req);
  if (!companyId && req.user.is_super_admin) {
    return sendError(res, 'company_id is required for super admin', 422, 'VALIDATION_ERROR');
  }
  const user = await userSvc.getById(id, companyId);
  sendSuccess(res, user);
});

exports.createUser = asyncHandler(async (req, res) => {
  const parsed = userCreateSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.issues[0].message, 422, 'VALIDATION_ERROR');
  const companyId = resolveCompanyId(req);
  if (!companyId && req.user.is_super_admin) {
    return sendError(res, 'company_id is required for super admin', 422, 'VALIDATION_ERROR');
  }
  const user = await userSvc.create(companyId, parsed.data);
  sendSuccess(res, user, 'User created', 201);
});

exports.updateUser = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (!id) return;
  const parsed = userUpdateSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.issues[0].message, 422, 'VALIDATION_ERROR');
  const companyId = resolveCompanyId(req);
  if (!companyId && req.user.is_super_admin) {
    return sendError(res, 'company_id is required for super admin', 422, 'VALIDATION_ERROR');
  }
  const user = await userSvc.update(id, companyId, parsed.data);
  sendSuccess(res, user, 'User updated');
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (!id) return;
  const password = req.body?.password;
  if (typeof password !== 'string' || password.length < 8) {
    return sendError(res, 'password must be at least 8 characters', 422, 'VALIDATION_ERROR');
  }
  const companyId = resolveCompanyId(req);
  if (!companyId && req.user.is_super_admin) {
    return sendError(res, 'company_id is required for super admin', 422, 'VALIDATION_ERROR');
  }
  await userSvc.resetPassword(id, companyId, req.user.is_super_admin, password);
  sendSuccess(res, null, 'Password reset');
});

exports.deactivateUser = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (!id) return;
  const companyId = resolveCompanyId(req);
  if (!companyId && req.user.is_super_admin) {
    return sendError(res, 'company_id is required for super admin', 422, 'VALIDATION_ERROR');
  }
  await userSvc.deactivate(id, companyId);
  sendSuccess(res, null, 'User deactivated');
});

exports.permanentDeleteUser = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (!id) return;
  const companyId = resolveCompanyId(req);
  if (!companyId && req.user.is_super_admin) {
    return sendError(res, 'company_id is required for super admin', 422, 'VALIDATION_ERROR');
  }
  await userSvc.permanentDelete(id, companyId, req.user.sub);
  sendSuccess(res, null, 'User deleted permanently');
});

// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// ANNOUNCEMENTS
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

exports.listAnnouncements = asyncHandler(async (req, res) => {
  const page  = Number(req.query.page)  || 1;
  const limit = Number(req.query.limit) || 20;
  const data  = await annSvc.list(resolveCompanyId(req), req.user, { page, limit });
  sendSuccess(res, data);
});

exports.getAnnouncement = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (!id) return;
  const ann = await annSvc.getById(id, resolveCompanyId(req));
  sendSuccess(res, ann);
});

exports.createAnnouncement = asyncHandler(async (req, res) => {
  const parsed = announcementCreateSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.issues[0].message, 422, 'VALIDATION_ERROR');
  const ann = await annSvc.create(resolveCompanyId(req), parsed.data, req.user.sub);
  sendSuccess(res, ann, 'Announcement created', 201);
});

exports.updateAnnouncement = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (!id) return;
  const parsed = announcementUpdateSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.issues[0].message, 422, 'VALIDATION_ERROR');
  const ann = await annSvc.update(id, resolveCompanyId(req), parsed.data);
  sendSuccess(res, ann, 'Announcement updated');
});

exports.deleteAnnouncement = asyncHandler(async (req, res) => {
  const id = parseId(req, res); if (!id) return;
  await annSvc.remove(id, resolveCompanyId(req));
  sendSuccess(res, null, 'Announcement deleted');
});

