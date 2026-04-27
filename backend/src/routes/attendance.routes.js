'use strict';

/**
 * Attendance routes
 *
 * GET  /api/attendance              – list records   (AUTH)
 * POST /api/attendance/checkin       – employee check-in (AUTH)
 * POST /api/attendance/checkout      – employee check-out (AUTH)
 * GET  /api/attendance/summary       – monthly summary (AUTH)
 * GET  /api/attendance/:id           – get one (AUTH)
 * POST /api/attendance              – manual create (HR|ADMIN)
 * PUT  /api/attendance/:id          – update (HR|ADMIN)
 * DELETE /api/attendance/:id        – delete (ADMIN)
 */

const { Router } = require('express');
const ctrl = require('../controllers/attendance.controller');
const { authenticate }  = require('../middleware/auth.middleware');
const { requireRole, requireFeature } = require('../middleware/role.middleware');

const r = Router();
const HR_ADMIN = ['ADMIN','HR'];

r.use(authenticate);
r.use(requireFeature('attendance'));

r.get ('/',          ctrl.list);
r.post('/checkin',   ctrl.checkIn);
r.post('/checkout',  ctrl.checkOut);
r.get ('/summary',   ctrl.summary);
r.get ('/surprise-attendance/active', ctrl.activeSurpriseAttendance);
r.get ('/:id',       ctrl.getOne);
r.post('/',          requireRole(...HR_ADMIN), ctrl.create);
r.put ('/:id',       requireRole(...HR_ADMIN), ctrl.update);
r.delete('/:id',     requireRole('ADMIN'),     ctrl.remove);

module.exports = r;

