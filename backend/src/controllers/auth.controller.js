'use strict';

/**
 * Auth Controller
 *
 * Thin HTTP layer — validates input, calls AuthService, sets cookies, sends responses.
 * All business logic lives in auth.service.js.
 *
 * Endpoints:
 *   POST /auth/login
 *   POST /auth/refresh
 *   POST /auth/logout
 *   GET  /auth/me
 */

const { z }           = require('zod');
const authService     = require('../services/auth.service');
const { getCompanyEnabledFeatures } = require('../services/company-feature.service');
const { sendSuccess, sendError, ERROR_CODES } = require('../utils/response');
const { REFRESH_COOKIE_MS } = require('../config/jwt');

// ── Validation schemas ─────────────────────────────────────────────────────

const toLatinDigits = (s) => String(s).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

/** Empty / whitespace → null; otherwise trimmed string (caller may uppercase). */
const preprocessOptionalString = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

const preprocessOptionalCompanyCode = (v) => {
  const s = preprocessOptionalString(v);
  if (s == null) return null;
  return toLatinDigits(s).toUpperCase();
};

/** Company login code: optional; if present must be 3–40 chars (avoid 422 on "" or while partial is sent as empty). */
const optionalCompanyCode = z.preprocess(
  preprocessOptionalCompanyCode,
  z.union([z.null(), z.string().min(3, 'رمز الشركة يجب أن يكون 3 أحرف على الأقل').max(40)])
).optional().default(null);

const optionalCompanyPassword = z.preprocess(
  preprocessOptionalString,
  z.union([z.null(), z.string().min(4, 'كلمة مرور الشركة يجب أن تكون 4 أحرف على الأقل').max(100)])
).optional().default(null);

const loginSchema = z.object({
  email     : z.string().email('Invalid email address'),
  password  : z.string().min(6, 'Password must be at least 6 characters'),
  company_id: z.number().int().positive().nullable().optional().default(null),
  company_code: optionalCompanyCode,
  company_password: optionalCompanyPassword,
});

const employeeLoginSchema = z.object({
  employee_code: z.preprocess(
    (v) => (v == null ? '' : toLatinDigits(String(v)).trim().toUpperCase()),
    z.string().min(1, 'employee_code is required'),
  ),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  company_code: optionalCompanyCode,
});

const requestResetSchema = z.object({
  email: z.string().email('Invalid email address'),
});

const resetPasswordSchema = z.object({
  token: z.string().min(10, 'Reset token is required'),
  new_password: z.string().min(8, 'Password must be at least 8 characters'),
});

// ── Cookie helpers ─────────────────────────────────────────────────────────

const REFRESH_COOKIE_NAME = 'hr_refresh_token';

/**
 * Refresh cookie SameSite/Secure: SPA on another host (e.g. Vercel → API on Railway)
 * needs `none` + `Secure` or the browser will not send the cookie on credentialed fetch.
 * Same-origin production (one domain behind Nginx): set REFRESH_COOKIE_SAMESITE=strict.
 */
const refreshCookieBase = () => {
  const raw = String(process.env.REFRESH_COOKIE_SAMESITE || '').trim().toLowerCase();
  const sameSite = ['strict', 'lax', 'none'].includes(raw)
    ? raw
    : process.env.NODE_ENV === 'production'
      ? 'none'
      : 'lax';
  const secureOff = String(process.env.REFRESH_COOKIE_SECURE || '').toLowerCase() === 'false';
  const secure = !secureOff && (sameSite === 'none' || process.env.NODE_ENV === 'production');
  return { httpOnly: true, path: '/', sameSite, secure };
};

/**
 * Set httpOnly refresh-token cookie.
 * @param {import('express').Response} res
 * @param {string} token
 */
const setRefreshCookie = (res, token) => {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    ...refreshCookieBase(),
    maxAge: REFRESH_COOKIE_MS,
  });
};

/** Clear the refresh cookie on logout. */
const clearRefreshCookie = (res) => {
  res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieBase());
};

// ── Handlers ───────────────────────────────────────────────────────────────

/**
 * POST /auth/login
 * Body: { email, password, company_id? }
 *
 * company_id is optional:
 *   - Omit (or null)  → attempt super-admin login
 *   - Provide integer → tenant user login
 */
const login = async (req, res) => {
  // 1. Validate request body
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(
      res,
      parsed.error.errors.map((e) => e.message).join(', '),
      422,
      ERROR_CODES.VALIDATION_ERROR
    );
  }

  let { email, password, company_id, company_code, company_password } = parsed.data;

  if ((company_id === null || company_id === undefined) && company_code) {
    const company = await authService.findCompanyByCode(company_code);
    if (!company) {
      return sendError(res, 'Invalid company code', 401, ERROR_CODES.INVALID_CREDENTIALS);
    }
    company_id = company.id;
  }

  // 2. Delegate to service
  const { accessToken, refreshToken, user } =
    await authService.login(email, password, company_id, company_password);

  // 3. Deliver tokens
  setRefreshCookie(res, refreshToken);

  return sendSuccess(
    res,
    { accessToken, user },
    'Login successful',
    200
  );
};

/**
 * POST /auth/refresh
 * No body — reads httpOnly cookie `hr_refresh_token`.
 */
const refresh = async (req, res) => {
  const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];

  if (!rawRefreshToken) {
    return sendError(res, 'No refresh token provided', 401, ERROR_CODES.UNAUTHORIZED);
  }

  const { accessToken, refreshToken } =
    await authService.refreshTokens(rawRefreshToken);

  setRefreshCookie(res, refreshToken);

  return sendSuccess(res, { accessToken }, 'Token refreshed');
};

/**
 * POST /auth/logout
 * Requires: valid access token (req.user set by auth middleware).
 */
const logout = async (req, res) => {
  await authService.logout(req.user.sub);
  clearRefreshCookie(res);
  return sendSuccess(res, null, 'Logged out successfully');
};

/**
 * GET /auth/me
 * Requires: valid access token.
 */
const getMe = async (req, res) => {
  const user = await authService.getMe(req.user.sub, req.user.company_id);
  const plain = typeof user?.toJSON === 'function' ? user.toJSON() : user;
  let companyFeatures = Array.isArray(req.user.company_features) ? req.user.company_features : [];
  if (!req.user.is_super_admin && plain.company_id) {
    try {
      companyFeatures = await getCompanyEnabledFeatures(plain.company_id);
    } catch (_) { /* keep token list */ }
  }
  plain.company_features = companyFeatures;
  return sendSuccess(res, plain);
};

/**
 * POST /auth/employee-login
 * Body: { employee_code, password, company_code? }
 */
const employeeLogin = async (req, res) => {
  const parsed = employeeLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(
      res,
      parsed.error.errors.map((e) => e.message).join(', '),
      422,
      ERROR_CODES.VALIDATION_ERROR
    );
  }

  const { accessToken, refreshToken, user } = await authService.employeeLogin(parsed.data);
  setRefreshCookie(res, refreshToken);
  return sendSuccess(res, { accessToken, user }, 'Login successful', 200);
};

/**
 * POST /auth/request-reset
 * Body: { email }
 */
const requestReset = async (req, res) => {
  const parsed = requestResetSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, parsed.error.errors.map((e) => e.message).join(', '), 422, ERROR_CODES.VALIDATION_ERROR);
  }

  const token = await authService.requestPasswordReset(parsed.data.email);
  return sendSuccess(res, { token }, 'If the email exists, a reset link has been generated');
};

/**
 * POST /auth/reset-password
 * Body: { token, new_password }
 */
const resetPassword = async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, parsed.error.errors.map((e) => e.message).join(', '), 422, ERROR_CODES.VALIDATION_ERROR);
  }

  await authService.resetPasswordWithToken(parsed.data.token, parsed.data.new_password);
  return sendSuccess(res, null, 'Password has been reset successfully');
};

module.exports = { login, employeeLogin, refresh, logout, getMe, requestReset, resetPassword };

