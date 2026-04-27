'use strict';

/**
 * Standardised JSON response helpers.
 *
 * Success: { success: true,  data:  <payload>, message: <string> }
 * Error  : { success: false, error: <message>,  code:    <string> }
 */

/**
 * @param {import('express').Response} res
 * @param {object}  data
 * @param {string}  [message]
 * @param {number}  [statusCode=200]
 */
const sendSuccess = (res, data = null, message = 'OK', statusCode = 200) =>
  res.status(statusCode).json({ success: true, message, data });

/**
 * @param {import('express').Response} res
 * @param {string}  message
 * @param {number}  [statusCode=400]
 * @param {string}  [code='BAD_REQUEST']
 */
const sendError = (res, message, statusCode = 400, code = 'BAD_REQUEST') =>
  res.status(statusCode).json({ success: false, error: message, code });

/**
 * Standard error codes (used in role/auth middleware and controllers).
 */
const ERROR_CODES = Object.freeze({
  UNAUTHORIZED        : 'UNAUTHORIZED',
  FORBIDDEN           : 'FORBIDDEN',
  NOT_FOUND           : 'NOT_FOUND',
  VALIDATION_ERROR    : 'VALIDATION_ERROR',
  INTERNAL_ERROR      : 'INTERNAL_ERROR',
  INVALID_CREDENTIALS : 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED       : 'TOKEN_EXPIRED',
  TOKEN_INVALID       : 'TOKEN_INVALID',
  ACCOUNT_DISABLED    : 'ACCOUNT_DISABLED',
});

module.exports = { sendSuccess, sendError, ERROR_CODES };

