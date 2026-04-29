'use strict';

/**
 * Auth Service
 *
 * Handles all authentication business logic:
 *   login         – validate credentials, issue token pair
 *   refreshTokens – rotate refresh token
 *   logout        – revoke refresh token from DB
 *   getMe         – load current user with role from DB
 *
 * Company isolation rule:
 *   Every query that touches user data is scoped by company_id
 *   UNLESS the user is a super-admin (company_id === null in the JWT).
 */

const { User, Role, Company, Employee } = require('../models/index');
const { Op } = require('sequelize');
const { comparePassword, hashPassword } = require('../utils/hash');
const jwt = require('jsonwebtoken');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} = require('../config/jwt');
const { enforceCompanyActive } = require('./company-status.service');
const { getCompanyEnabledFeatures } = require('./company-feature.service');

// ── Constants ────────────────────────────────────────────────────────────────

const SUPER_ADMIN_ROLE = 'SUPER_ADMIN';   // built-in role name for super admin
const RESET_SECRET = process.env.JWT_RESET_SECRET || process.env.JWT_SECRET || 'change_me_reset_secret';
const RESET_EXP = process.env.JWT_RESET_EXPIRES_IN || '30m';

const toLatinDigits = (value) => String(value || '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

const normalizeCompanyCodeInput = (value) => toLatinDigits(value)
  .trim()
  .toUpperCase()
  .replace(/\s+/g, '')
  .replace(/[^\w-]/g, '');

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build the JWT payload from a user + role row.
 * @param {User}  user
 * @param {Role}  role
 * @returns {object}
 */
const buildPayload = (user, role, companyFeatures = []) => ({
  sub           : user.id,
  company_id    : user.company_id ?? null,
  employee_id   : user.employee_id ?? null,
  role_id       : user.role_id ?? null,
  role          : role.name,
  is_super_admin: role.name === SUPER_ADMIN_ROLE,
  permissions   : Array.isArray(role.permissions) ? role.permissions : [],
  company_features: Array.isArray(companyFeatures) ? companyFeatures : [],
});

/**
 * Hash and store a new refresh token for the user.
 * @param {User}   user
 * @param {string} rawRefreshToken
 */
const saveRefreshToken = async (user, rawRefreshToken) => {
  const hashed = await hashPassword(rawRefreshToken);
  await user.update({ refresh_token: hashed, last_login: new Date() });
};

const buildSession = async (user) => {
  const companyFeatures = user.company_id
    ? await getCompanyEnabledFeatures(user.company_id)
    : [];
  const payload      = buildPayload(user, user.role, companyFeatures);
  const accessToken  = signAccessToken(payload);
  const refreshToken = signRefreshToken({ sub: user.id });

  await saveRefreshToken(user, refreshToken);

  return {
    accessToken,
    refreshToken,
    user: {
      id            : user.id,
      email         : user.email,
      company_id    : user.company_id,
      employee_id   : user.employee_id ?? null,
      role          : user.role.name,
      is_super_admin: payload.is_super_admin,
      permissions   : payload.permissions,
      company_features: payload.company_features,
    },
  };
};

// ── Service methods ───────────────────────────────────────────────────────────

/**
 * Authenticate a user by email + password within a given company.
 *
 * @param {string}      email
 * @param {string}      password
 * @param {number|null} company_id   Pass null for super-admin login attempts.
 * @returns {{ accessToken, refreshToken, user: object }}
 * @throws  {Error}  with .statusCode for controller handling
 */
const login = async (email, password, company_id = null, company_password = null) => {
  // Build the query scope:
  //   If company_id provided: find by email AND company_id
  //   If not provided: find by email only (single-company / super-admin)
  const normalizedEmail = email.trim().toLowerCase();
  // Scope by company only when an explicit numeric tenant id was resolved (e.g. from company_code).
  // Do not use `company_id !== null` — `undefined` would wrongly enable the scoped branch in JS.
  const tenantScoped = Number.isInteger(company_id) && company_id > 0;
  const whereClause = tenantScoped
    ? { email: normalizedEmail, company_id, is_active: 1 }
    : { email: normalizedEmail, is_active: 1 };

  const user = await User.findOne({
    where  : whereClause,
    include: [{ model: Role, as: 'role' }],
  });

  if (!user) {
    const err = new Error('Invalid email or password');
    err.statusCode = 401;
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  const passwordValid = await comparePassword(password, user.password_hash);
  if (!passwordValid) {
    const err = new Error('Invalid email or password');
    err.statusCode = 401;
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  const isSuperAdmin = String(user?.role?.name || '').toUpperCase() === SUPER_ADMIN_ROLE;

  // Tenant guard: non-super-admin users must satisfy company status/password checks.
  // Super admin login should never require company password, even on legacy rows
  // where company_id is still populated.
  if (user.company_id !== null && !isSuperAdmin) {
    const company = await enforceCompanyActive(user.company_id);

    if (company.login_password_hash) {
      if (!company_password) {
        const err = new Error('Company password required');
        err.statusCode = 401;
        err.code = 'COMPANY_PASSWORD_REQUIRED';
        throw err;
      }

      const companyPassOk = await comparePassword(company_password, company.login_password_hash);
      if (!companyPassOk) {
        const err = new Error('Invalid company password');
        err.statusCode = 401;
        err.code = 'COMPANY_PASSWORD_INVALID';
        throw err;
      }
    }
  }

  return buildSession(user);
};

const employeeLogin = async ({ employee_code, password, company_code = null }) => {
  const company = company_code ? await findCompanyByCode(company_code) : null;
  if (company_code && !company) {
    const err = new Error('Invalid company code');
    err.statusCode = 401;
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  const employee = await Employee.findOne({
    where: {
      employee_number: employee_code,
      ...(company ? { company_id: company.id } : {}),
      deleted_at: null,
    },
  });

  if (!employee) {
    const err = new Error('Invalid employee code or password');
    err.statusCode = 401;
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  const user = await User.findOne({
    where: { employee_id: employee.id, is_active: 1 },
    include: [{ model: Role, as: 'role' }],
  });

  if (!user) {
    const err = new Error('No login account linked to this employee');
    err.statusCode = 401;
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  const passwordValid = await comparePassword(password, user.password_hash);
  if (!passwordValid) {
    const err = new Error('Invalid employee code or password');
    err.statusCode = 401;
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  if (user.company_id !== null) {
    await enforceCompanyActive(user.company_id);
  }

  return buildSession(user);
};

/**
 * Rotate both tokens given a valid raw refresh token.
 *
 * @param {string} rawRefreshToken  — from httpOnly cookie
 * @returns {{ accessToken, refreshToken }}
 * @throws  {Error}
 */
const refreshTokens = async (rawRefreshToken) => {
  // 1. Verify JWT structure + expiry
  let decoded;
  try {
    decoded = verifyRefreshToken(rawRefreshToken);
  } catch {
    const err = new Error('Refresh token is invalid or expired');
    err.statusCode = 401;
    err.code = 'TOKEN_INVALID';
    throw err;
  }

  // 2. Load user from DB
  const user = await User.findOne({
    where  : { id: decoded.sub, is_active: 1 },
    include: [{ model: Role, as: 'role' }],
  });

  if (!user || !user.refresh_token) {
    const err = new Error('Session not found or already logged out');
    err.statusCode = 401;
    err.code = 'TOKEN_INVALID';
    throw err;
  }

  // 3. Validate that the raw token matches the stored hash (rotation attack protection)
  const tokenMatches = await comparePassword(rawRefreshToken, user.refresh_token);
  if (!tokenMatches) {
    // Possible token reuse — revoke all sessions for safety
    await user.update({ refresh_token: null });
    const err = new Error('Refresh token reuse detected');
    err.statusCode = 401;
    err.code = 'TOKEN_INVALID';
    throw err;
  }

  // 4. Issue a new token pair (rotation)
  const companyFeatures = user.company_id
    ? await getCompanyEnabledFeatures(user.company_id)
    : [];
  const payload      = buildPayload(user, user.role, companyFeatures);
  const accessToken  = signAccessToken(payload);
  const refreshToken = signRefreshToken({ sub: user.id });

  await saveRefreshToken(user, refreshToken);

  return { accessToken, refreshToken };
};

/**
 * Revoke the refresh token stored in DB for the given user id.
 * @param {number} userId
 */
const logout = async (userId) => {
  await User.update(
    { refresh_token: null },
    { where: { id: userId } }
  );
};

/**
 * Return full current-user data scoped by company.
 * @param {number}      userId
 * @param {number|null} company_id  null = super-admin (no scope filter)
 */
const getMe = async (userId, company_id) => {
  const whereClause = company_id !== null
    ? { id: userId, company_id }
    : { id: userId };

  const user = await User.findOne({
    where      : whereClause,
    include    : [{ model: Role, as: 'role' }],
    attributes : { exclude: ['password_hash', 'refresh_token'] },
  });

  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  return user;
};

/**
 * Generate a short-lived password reset token.
 * Always resolves successfully to avoid account enumeration.
 */
const requestPasswordReset = async (email) => {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findOne({ where: { email: normalizedEmail, is_active: 1 } });
  if (!user) return null;

  return jwt.sign({ sub: user.id, purpose: 'password_reset' }, RESET_SECRET, { expiresIn: RESET_EXP });
};

const findCompanyByCode = async (companyCode) => Company.findOne({
  where: (() => {
    const normalized = normalizeCompanyCodeInput(companyCode);
    if (!normalized) return { id: -1 };
    if (/^\d+$/.test(normalized)) {
      return { id: Number(normalized), is_active: 1 };
    }
    return {
      is_active: 1,
      [Op.or]: [
        { tax_id: normalized },
      ],
    };
  })(),
});

/**
 * Reset password using reset token generated by requestPasswordReset.
 */
const resetPasswordWithToken = async (token, newPassword) => {
  let decoded;
  try {
    decoded = jwt.verify(token, RESET_SECRET);
  } catch {
    const err = new Error('Reset token is invalid or expired');
    err.statusCode = 401;
    err.code = 'TOKEN_INVALID';
    throw err;
  }

  if (decoded.purpose !== 'password_reset' || !decoded.sub) {
    const err = new Error('Reset token is invalid');
    err.statusCode = 401;
    err.code = 'TOKEN_INVALID';
    throw err;
  }

  const user = await User.findOne({ where: { id: decoded.sub, is_active: 1 } });
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  const password_hash = await hashPassword(newPassword);
  await user.update({ password_hash, refresh_token: null });
};

module.exports = {
  login,
  refreshTokens,
  logout,
  getMe,
  requestPasswordReset,
  resetPasswordWithToken,
  employeeLogin,
  findCompanyByCode,
};

