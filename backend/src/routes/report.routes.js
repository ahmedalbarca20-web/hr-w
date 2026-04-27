'use strict';

const { Router }       = require('express');
const ctrl             = require('../controllers/report.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole, requireFeature }  = require('../middleware/role.middleware');

const r = Router();
r.use(authenticate);
r.use(requireFeature('reports'));
r.use(requireRole('ADMIN','HR'));

r.get('/attendance', ctrl.attendanceReport);
r.get('/leaves',     ctrl.leaveReport);
r.get('/payroll',    ctrl.payrollReport);
r.get('/headcount',  ctrl.headcountReport);

module.exports = r;

