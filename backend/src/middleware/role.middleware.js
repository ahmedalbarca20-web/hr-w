'use strict';

/**
 * role.middleware.js
 *
 * Role-based and permission-based access control.
 *
 * Company isolation:
 *   Every request from a non-super-admin must carry a company_id in the token
 *   that matches the resource's company.  Enforced in service layers too, but
 *   this middleware provides a fast HTTP-layer gate.
 *
 * Usage examples:
 *
 *   // Gate by role name(s)
 *   router.get('/payroll', authenticate, requireRole('ADMIN', 'HR'), handler);
 *
 *   // Gate by permission key
 *   router.delete('/employees/:id', authenticate, requirePermission('employees:delete'), handler);
 *
 *   // Restrict to super-admin only
 *   router.post('/companies', authenticate, requireSuperAdmin, handler);
 */

const { sendError, ERROR_CODES } = require('../utils/response');

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns whether the current user can act on the given company_id.
 * Super-admin can act on ANY company.
 * Normal users can only act on their own company.
 *
 * @param {object}      user         req.user (JWT payload)
 * @param {number|null} companyId    Target company id from route/body
 * @returns {boolean}
 */
const canAccessCompany = (user, companyId) => {
  if (user.is_super_admin) return true;
  return user.company_id !== null && user.company_id === Number(companyId);
};

// ── Middleware factories ──────────────────────────────────────────────────────

/**
 * Require the authenticated user to hold one of the specified role names.
 *
 * @param  {...string} roles   Allowed role name(s), e.g. 'ADMIN', 'HR'
 * @returns {import('express').RequestHandler}
 */
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) {
    return sendError(res, 'Authentication required', 401, ERROR_CODES.UNAUTHORIZED);
  }

  // Super-admin bypasses role checks
  if (req.user.is_super_admin) return next();

  const userRole = req.user.role?.toUpperCase();
  const allowed  = roles.map((r) => r.toUpperCase());

  if (!allowed.includes(userRole)) {
    return sendError(
      res,
      `Access denied. Required role(s): ${roles.join(', ')}`,
      403,
      ERROR_CODES.FORBIDDEN
    );
  }

  return next();
};

/**
 * Require the authenticated user to hold a specific permission key.
 *
 * @param  {string} permission   e.g. 'payroll:write'
 * @returns {import('express').RequestHandler}
 */
const requirePermission = (permission) => (req, res, next) => {
  if (!req.user) {
    return sendError(res, 'Authentication required', 401, ERROR_CODES.UNAUTHORIZED);
  }

  // Super-admin bypasses permission checks
  if (req.user.is_super_admin) return next();

  const hasPermission =
    Array.isArray(req.user.permissions) &&
    req.user.permissions.includes(permission);

  if (!hasPermission) {
    return sendError(
      res,
      `Access denied. Required permission: ${permission}`,
      403,
      ERROR_CODES.FORBIDDEN
    );
  }

  return next();
};

/**
 * Require a company-level feature/module to be enabled.
 * Super-admin bypasses this check.
 *
 * @param {string} featureKey
 * @returns {import('express').RequestHandler}
 */
const requireFeature = (featureKey) => (req, res, next) => {
  if (!req.user) {
    return sendError(res, 'Authentication required', 401, ERROR_CODES.UNAUTHORIZED);
  }

  if (req.user.is_super_admin) return next();

  const enabled = Array.isArray(req.user.company_features)
    ? req.user.company_features
    : [];

  if (!enabled.includes(String(featureKey || '').toLowerCase())) {
    return sendError(
      res,
      `This feature is not enabled for your company: ${featureKey}`,
      403,
      ERROR_CODES.FORBIDDEN
    );
  }

  return next();
};

/**
 * Restrict a route to super-admin accounts only.
 * @type {import('express').RequestHandler}
 */
const requireSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return sendError(res, 'Authentication required', 401, ERROR_CODES.UNAUTHORIZED);
  }

  if (!req.user.is_super_admin) {
    return sendError(
      res,
      'This action is restricted to super administrators',
      403,
      ERROR_CODES.FORBIDDEN
    );
  }

  return next();
};

/**
 * Ensure the requesting user belongs to the target company.
 * Reads company id from: req.params.company_id → req.body.company_id → req.user.company_id.
 * Super-admin always passes.
 *
 * @type {import('express').RequestHandler}
 */
const requireCompany = (req, res, next) => {
  if (!req.user) {
    return sendError(res, 'Authentication required', 401, ERROR_CODES.UNAUTHORIZED);
  }

  if (req.user.is_super_admin) return next();

  const targetCompany =
    req.params.company_id ??
    req.body?.company_id  ??
    req.query?.company_id ??
    null;

  // If no specific company is targeted, allow through (service layer will enforce)
  if (targetCompany === null || targetCompany === undefined) return next();

  if (!canAccessCompany(req.user, targetCompany)) {
    return sendError(
      res,
      'You do not have access to this company\'s data',
      403,
      ERROR_CODES.FORBIDDEN
    );
  }

  return next();
};

module.exports = {
  requireRole,
  requirePermission,
  requireFeature,
  requireSuperAdmin,
  requireCompany,
  canAccessCompany,
};

