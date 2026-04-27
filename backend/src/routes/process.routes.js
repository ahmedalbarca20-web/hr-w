'use strict';

/**
 * Attendance Processing routes
 *
 * All routes require JWT auth + HR or ADMIN role.
 *
 * POST /api/process                         – bulk for a date
 * POST /api/process/employee/:employee_id   – single employee
 * POST /api/process/reprocess               – reset + re-run
 */

const { Router }      = require('express');
const ctrl            = require('../controllers/attendance_processor.controller');
const { authenticate }  = require('../middleware/auth.middleware');
const { requireRole, requireFeature } = require('../middleware/role.middleware');

const r       = Router();
const HR_ADMIN = ['ADMIN', 'HR'];

r.use(authenticate);
r.use(requireFeature('process'));
r.use(requireRole(...HR_ADMIN));

// NOTE: /employee/:id must be declared before the generic /reprocess
// to avoid any possible router ambiguity, though both use POST.
r.post('/employee/:employee_id', ctrl.processEmployee);
r.post('/reprocess',             ctrl.reprocess);
r.post('/surprise-attendance/activate', requireRole('ADMIN'), ctrl.activateSurpriseAttendance);
r.post('/surprise-attendance/cancel', requireRole('ADMIN'), ctrl.cancelSurpriseAttendance);
r.post('/',                      ctrl.processBulk);

module.exports = r;
