'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/response');
const setupSvc = require('../services/setup.service');

function resolveCompanyId(req) {
  if (req.user?.is_super_admin) {
    const raw = req.body?.company_id ?? req.query?.company_id;
    const n = Number(raw);
    if (Number.isInteger(n) && n > 0) return n;
    return null;
  }
  const cid = req.user?.company_id;
  return Number.isInteger(Number(cid)) && Number(cid) > 0 ? Number(cid) : null;
}

const requireCompany = (req, res) => {
  const companyId = resolveCompanyId(req);
  if (companyId == null) {
    sendError(res, 'Company context is required.', 422, 'VALIDATION_ERROR');
    return null;
  }
  return companyId;
};

exports.getStatus = asyncHandler(async (req, res) => {
  const companyId = requireCompany(req, res);
  if (companyId == null) return;
  const data = await setupSvc.buildStatus(companyId);
  sendSuccess(res, data);
});

exports.start = asyncHandler(async (req, res) => {
  const companyId = requireCompany(req, res);
  if (companyId == null) return;
  const data = await setupSvc.start(companyId);
  sendSuccess(res, data);
});

exports.workHours = asyncHandler(async (req, res) => {
  const companyId = requireCompany(req, res);
  if (companyId == null) return;
  const { work_start, work_end, work_days } = req.body || {};
  const data = await setupSvc.saveWorkHours(companyId, { work_start, work_end, work_days });
  sendSuccess(res, data);
});

exports.testDevice = asyncHandler(async (req, res) => {
  const companyId = requireCompany(req, res);
  if (companyId == null) return;
  const { ip_address, port } = req.body || {};
  const data = await setupSvc.testDeviceConnection({ ip_address, port });
  sendSuccess(res, data);
});

exports.device = asyncHandler(async (req, res) => {
  const companyId = requireCompany(req, res);
  if (companyId == null) return;
  const { name, ip_address, port } = req.body || {};
  const data = await setupSvc.saveDevice(companyId, { name, ip_address, port });
  sendSuccess(res, data);
});

exports.importEmployees = asyncHandler(async (req, res) => {
  const companyId = requireCompany(req, res);
  if (companyId == null) return;
  const { device_id, uids, skip, phase } = req.body || {};
  if (phase === 'list') {
    const data = await setupSvc.listDeviceEmployees(companyId, { device_id, port: req.body?.port });
    return sendSuccess(res, data);
  }
  const data = await setupSvc.importEmployees(companyId, { device_id, uids, skip });
  sendSuccess(res, data);
});

exports.complete = asyncHandler(async (req, res) => {
  const companyId = requireCompany(req, res);
  if (companyId == null) return;
  const data = await setupSvc.complete(companyId);
  sendSuccess(res, data);
});
