'use strict';

/**
 * JWT configuration and token utilities.
 *
 * Token anatomy:
 *   Access token  — short-lived (8 h), sent in Authorization: Bearer header.
 *   Refresh token — long-lived (7 d), stored hashed in users.refresh_token;
 *                   returned in httpOnly cookie on POST /auth/refresh.
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const isProd = process.env.NODE_ENV === 'production';

const buildProdFallbackSecret = (name) => {
  const seedParts = [
    process.env.DATABASE_URL,
    process.env.SUPABASE_DB_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
    process.env.VERCEL_GIT_COMMIT_SHA,
    name,
  ].filter(Boolean);
  const seed = seedParts.join('|');
  if (!seed) return `prod_fallback_${name}_replace_me`;
  return crypto.createHash('sha256').update(seed).digest('hex');
};

const readSecret = (name, devFallback) => {
  const value = String(process.env[name] || '').trim();
  if (value) {
    if (isProd && /^change_me/i.test(value)) {
      console.warn(`[SECURITY] Weak value for env var: ${name}; using derived fallback secret.`);
      return buildProdFallbackSecret(name);
    }
    return value;
  }
  if (isProd) {
    console.warn(`[SECURITY] Missing env var: ${name}; using derived fallback secret.`);
    return buildProdFallbackSecret(name);
  }
  return devFallback;
};

const ACCESS_SECRET  = readSecret('JWT_SECRET', 'dev_only_access_secret');
const REFRESH_SECRET = readSecret('JWT_REFRESH_SECRET', 'dev_only_refresh_secret');
const ACCESS_EXP     = process.env.JWT_EXPIRES_IN      || '8h';
const REFRESH_EXP    = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

/**
 * Payload shape stored inside every token:
 * {
 *   sub           : user.id,
 *   company_id    : user.company_id,   // null → super-admin (no tenant restriction)
 *   role          : role.name,
 *   is_super_admin: boolean,
 *   permissions   : string[],
 * }
 */

/** @param {object} payload */
const signAccessToken = (payload) =>
  jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXP });

/** @param {object} payload */
const signRefreshToken = (payload) =>
  jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXP });

/**
 * Verify an access token.
 * @throws {JsonWebTokenError | TokenExpiredError}
 */
const verifyAccessToken = (token) =>
  jwt.verify(token, ACCESS_SECRET);

/**
 * Verify a refresh token.
 * @throws {JsonWebTokenError | TokenExpiredError}
 */
const verifyRefreshToken = (token) =>
  jwt.verify(token, REFRESH_SECRET);

/** Seconds in the refresh expiry window (for cookie maxAge). */
const REFRESH_COOKIE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  REFRESH_COOKIE_MS,
};
