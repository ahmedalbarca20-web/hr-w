'use strict';

const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { Router } = require('express');
const ctrl = require('../controllers/attendance_request.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole, requireFeature } = require('../middleware/role.middleware');

const { getUploadsRoot } = require('../config/upload.paths');

const r = Router();
const uploadBaseDir = getUploadsRoot();
const uploadDir = path.join(uploadBaseDir, 'attendance-requests');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    cb(null, `attreq_${Date.now()}_${Math.random().toString(36).slice(2, 9)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, /^image\/(jpeg|jpg|png|webp)$/i.test(String(file.mimetype || '')));
  },
});

r.use(authenticate);
r.use(requireFeature('attendance'));

r.post('/', upload.single('photo'), ctrl.createRequest);
r.get('/', ctrl.listRequests);
r.patch('/:id/review', requireRole('ADMIN', 'HR'), ctrl.reviewRequest);

module.exports = r;
