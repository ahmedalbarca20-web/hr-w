'use strict';

/** HTTP 400 — used by services; Express maps `statusCode` + `code`. */
function badReq(message) {
  return Object.assign(new Error(message), { statusCode: 400, code: 'VALIDATION_ERROR' });
}

/** HTTP 404 — device (or device-scoped resource) not found. */
function notFound(id) {
  return Object.assign(new Error(`Device ${id} not found`), { statusCode: 404, code: 'NOT_FOUND' });
}

module.exports = { badReq, notFound };
