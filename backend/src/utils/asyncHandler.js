'use strict';

/**
 * Wraps async route handlers so any rejected promise is forwarded
 * to Express error-handling middleware automatically.
 *
 * Without this, unhandled promise rejections in async handlers would
 * silently crash in Express 4 (Express 5 handles them natively, but
 * this wrapper keeps parity with Express 4 if downgraded).
 *
 * @param {import('express').RequestHandler} fn
 * @returns {import('express').RequestHandler}
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
