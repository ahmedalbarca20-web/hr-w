'use strict';

/**
 * auth.middleware.js
 *
 * Verifies the JWT access token on every protected route.
 *
 * On success:  populates req.user with the decoded payload and calls next().
 * On failure:  returns 401 with a structured error response.
 *
 * Token is expected in:  Authorization: Bearer <accessToken>
 */

const { verifyAccessToken }      = require('../config/jwt');
const { sendError, ERROR_CODES } = require('../utils/response');
const { enforceCompanyActive }   = require('../services/company-status.service');
const { User }                  = require('../models/index');
const { getCompanyEnabledFeatures } = require('../services/company-feature.service');

const toPositiveInt = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const extractRequestedCompanyId = (req) => {
  const fromQuery = req.query?.company_id ?? req.query?.companyId;
  if (fromQuery !== undefined) return toPositiveInt(fromQuery);
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    return toPositiveInt(req.body.company_id ?? req.body.companyId);
  }
  return null;
};

const isTenantAgnosticPath = (req) => {
  const p = String(req.originalUrl || req.baseUrl || req.path || '').toLowerCase();
  // Super-admin company management and auth endpoints can run without tenant context.
  return p.startsWith('/api/companies') || p.startsWith('/api/auth');
};

/**
 * @type {import('express').RequestHandler}
 */
const authenticate = async (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return sendError(
      res,
      'Authentication required. Provide a Bearer token.',
      401,
      ERROR_CODES.UNAUTHORIZED
    );
  }

  const token = authHeader.slice(7); // strip 'Bearer '

  try {
    const decoded = verifyAccessToken(token);
    /**
     * req.user shape (mirrors JWT payload):
     * {
     *   sub           : number,   // user id
     *   company_id    : number|null,
     *   role          : string,
     *   is_super_admin: boolean,
     *   permissions   : string[],
     *   iat           : number,
     *   exp           : number,
     * }
     */
    req.user = decoded;

    // Backwards-compat / convenience: expose user id as `id` too
    if (req.user && req.user.id == null && req.user.sub != null) {
      req.user.id = req.user.sub;
    }

    // Strict tenant isolation:
    // - non-super-admin users are hard scoped to their JWT company
    // - super-admin can scope by company_id when token has no company
    const requestedCompanyId = extractRequestedCompanyId(req);
    const tokenCompanyId = toPositiveInt(req.user.company_id);
    const isSuperAdmin = Boolean(req.user.is_super_admin)
      || String(req.user.role || '').toUpperCase() === 'SUPER_ADMIN';

    if (!isSuperAdmin) {
      if (!tokenCompanyId) {
        return sendError(res, 'No company assigned to this account', 403, ERROR_CODES.FORBIDDEN);
      }
      if (requestedCompanyId && requestedCompanyId !== tokenCompanyId) {
        return sendError(res, 'Cross-company access is forbidden', 403, ERROR_CODES.FORBIDDEN);
      }
      req.user.company_id = tokenCompanyId;
      req.tenant_company_id = tokenCompanyId;
    } else {
      if (tokenCompanyId && requestedCompanyId && requestedCompanyId !== tokenCompanyId) {
        return sendError(res, 'Cross-company access is forbidden', 403, ERROR_CODES.FORBIDDEN);
      }
      if (!tokenCompanyId && !requestedCompanyId && !isTenantAgnosticPath(req)) {
        return sendError(
          res,
          'company_id is required for super admin on tenant-scoped routes',
          422,
          ERROR_CODES.VALIDATION_ERROR
        );
      }
      const effectiveCompanyId = tokenCompanyId || requestedCompanyId || null;
      req.user.company_id = effectiveCompanyId;
      req.tenant_company_id = effectiveCompanyId;
    }

    // Backwards-compat: older tokens may not contain employee_id
    if (req.user && req.user.sub != null
      && (req.user.employee_id === undefined || req.user.role_id === undefined)) {
      try {
        const u = await User.findByPk(req.user.sub, { attributes: ['employee_id', 'role_id'] });
        if (req.user.employee_id === undefined) req.user.employee_id = u?.employee_id ?? null;
        if (req.user.role_id === undefined) req.user.role_id = u?.role_id ?? null;
      } catch {
        if (req.user.employee_id === undefined) req.user.employee_id = null;
        if (req.user.role_id === undefined) req.user.role_id = null;
      }
    }

    // Backwards-compat: older tokens may not contain company feature flags
    if (req.user && req.user.company_features === undefined) {
      try {
        req.user.company_features = req.user.company_id
          ? await getCompanyEnabledFeatures(req.user.company_id)
          : [];
      } catch {
        req.user.company_features = [];
      }
    }

    // Enforce company is active & contract valid for non-super-admins
    if (!req.user.is_super_admin && req.user.company_id) {
      try {
        const company = await enforceCompanyActive(req.user.company_id);
        req.company = company;
      } catch (err) {
        return sendError(
          res,
          err.message || 'Company inactive',
          err.statusCode || 403,
          err.code || ERROR_CODES.FORBIDDEN
        );
      }
    }

    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return sendError(res, 'Access token has expired', 401, ERROR_CODES.TOKEN_EXPIRED);
    }
    return sendError(res, 'Access token is invalid', 401, ERROR_CODES.TOKEN_INVALID);
  }
};

module.exports = { authenticate };

