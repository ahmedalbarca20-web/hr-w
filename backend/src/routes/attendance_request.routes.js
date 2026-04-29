'use strict';

const multer = require('multer');
const { Router } = require('express');
const ctrl = require('../controllers/attendance_request.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole, requireFeature } = require('../middleware/role.middleware');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, /^image\/(jpeg|jpg|png|webp)$/i.test(String(file.mimetype || '')));
  },
});

const r = Router();

r.use(authenticate);
r.use(requireFeature('attendance'));

r.get('/:id/photo', ctrl.getPhoto);
r.post('/', upload.single('photo'), ctrl.createRequest);
r.get('/', ctrl.listRequests);
r.patch('/:id/review', requireRole('ADMIN', 'HR'), ctrl.reviewRequest);

module.exports = r;
