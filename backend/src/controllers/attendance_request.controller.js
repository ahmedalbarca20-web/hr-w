'use strict';

const fs = require('fs');
const path = require('path');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/response');
const { getUploadsRoot } = require('../config/upload.paths');
const AttendanceRequest = require('../models/attendance_request.model');
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
  const row = await svc.submitRequest(company_id, employee_id, parsed.data, {
    buffer: req.file.buffer,
    mime: req.file.mimetype,
  });
  sendSuccess(res, row, 'Attendance request submitted', 201);
});

const LEGACY_EXT_MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

exports.getPhoto = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return sendError(res, 'Invalid id parameter', 400, 'VALIDATION_ERROR');
  const company_id = resolveCompanyId(req, res);
  if (!company_id) return;

  const row = await AttendanceRequest.unscoped().findByPk(id, {
    attributes: ['id', 'company_id', 'employee_id', 'photo_binary', 'photo_mime', 'photo_path', 'status'],
  });
  if (!row || Number(row.company_id) !== Number(company_id)) {
    return sendError(res, 'Not found', 404, 'NOT_FOUND');
  }

  const roleRaw = req.user.role;
  const role = typeof roleRaw === 'object' && roleRaw?.name
    ? String(roleRaw.name).toUpperCase()
    : String(roleRaw || '').toUpperCase();
  const privileged = ['ADMIN', 'HR', 'SUPER_ADMIN'].includes(role) || req.user.is_super_admin;
  if (!privileged && Number(req.user.employee_id) !== Number(row.employee_id)) {
    return sendError(res, 'Forbidden', 403, 'FORBIDDEN');
  }

  const rawBin = row.get('photo_binary');
  const bin = rawBin == null ? null : Buffer.from(rawBin);
  if (bin && bin.length > 0) {
    const mime = String(row.get('photo_mime') || 'application/octet-stream').trim();
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).send(Buffer.from(bin));
  }

  const rel = row.get('photo_path');
  if (rel) {
    try {
      const clean = String(rel).replace(/^[/\\]?uploads[/\\]/i, '').replace(/\\/g, path.sep);
      const full = path.join(getUploadsRoot(), clean);
      if (fs.existsSync(full)) {
        const ext = path.extname(full).toLowerCase();
        const mime = LEGACY_EXT_MIME[ext] || 'application/octet-stream';
        res.setHeader('Content-Type', mime);
        res.setHeader('Cache-Control', 'private, no-store');
        return res.status(200).send(fs.readFileSync(full));
      }
    } catch {
      /* fall through */
    }
  }

  return sendError(res, 'Photo not available', 404, 'NOT_FOUND');
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

