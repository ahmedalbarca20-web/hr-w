'use strict';

/**
 * Department Controller
 *
 * GET    /departments       — list
 * POST   /departments       — create
 * GET    /departments/:id   — get one
 * PUT    /departments/:id   — update
 * DELETE /departments/:id   — hard delete (blocked if employees exist)
 */

const deptService = require('../services/department.service');
const { sendSuccess, sendError, ERROR_CODES } = require('../utils/response');
const { departmentCreateSchema, departmentUpdateSchema, zId } = require('../utils/validators');

const resolveCompanyId = (req) => {
  if (req.user.is_super_admin) {
    return req.query.company_id ? parseInt(req.query.company_id, 10) : req.user.company_id;
  }
  return req.user.company_id;
};

const parseId = (req, res) => {
  const parsed = zId.safeParse(req.params.id);
  if (!parsed.success) {
    sendError(res, 'Invalid department id', 400, ERROR_CODES.VALIDATION_ERROR);
    return null;
  }
  return parsed.data;
};

/** GET /departments */
const list = async (req, res) => {
  const company_id = resolveCompanyId(req);
  const filters    = {
    page      : req.query.page  ? parseInt(req.query.page, 10)  : 1,
    limit     : req.query.limit ? parseInt(req.query.limit, 10) : 50,
    is_active : req.query.is_active !== undefined
      ? parseInt(req.query.is_active, 10)
      : undefined,
  };
  const result = await deptService.list(company_id, filters);
  return sendSuccess(res, result);
};

/** GET /departments/:id */
const getOne = async (req, res) => {
  const id         = parseId(req, res); if (!id) return;
  const company_id = resolveCompanyId(req);
  const dept       = await deptService.getById(id, company_id);
  return sendSuccess(res, dept);
};

/** POST /departments */
const create = async (req, res) => {
  const company_id = resolveCompanyId(req);

  const parsed = departmentCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(
      res,
      parsed.error.errors.map((e) => e.message).join(', '),
      422,
      ERROR_CODES.VALIDATION_ERROR
    );
  }

  const dept = await deptService.create(company_id, parsed.data);
  return sendSuccess(res, dept, 'Department created successfully', 201);
};

/** PUT /departments/:id */
const update = async (req, res) => {
  const id         = parseId(req, res); if (!id) return;
  const company_id = resolveCompanyId(req);

  const parsed = departmentUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(
      res,
      parsed.error.errors.map((e) => e.message).join(', '),
      422,
      ERROR_CODES.VALIDATION_ERROR
    );
  }

  const dept = await deptService.update(id, company_id, parsed.data);
  return sendSuccess(res, dept, 'Department updated successfully');
};

/** DELETE /departments/:id */
const remove = async (req, res) => {
  const id         = parseId(req, res); if (!id) return;
  const company_id = resolveCompanyId(req);
  await deptService.remove(id, company_id);
  return sendSuccess(res, null, 'Department deleted successfully');
};

module.exports = { list, getOne, create, update, remove };

