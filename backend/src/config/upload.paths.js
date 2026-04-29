'use strict';

const path = require('path');

/**
 * Writable uploads root — must match multer destinations (e.g. attendance-requests, contracts).
 * On Vercel serverless the filesystem is read-only except /tmp.
 */
function getUploadsRoot() {
  return process.env.VERCEL
    ? path.join('/tmp', 'uploads')
    : path.join(__dirname, '..', '..', 'uploads');
}

module.exports = { getUploadsRoot };
