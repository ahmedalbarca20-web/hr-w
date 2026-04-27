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

const ACCESS_SECRET  = process.env.JWT_SECRET          || 'change_me_access_secret';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET  || 'change_me_refresh_secret';
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
