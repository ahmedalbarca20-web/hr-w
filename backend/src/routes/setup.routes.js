'use strict';

/**
 * Guided company onboarding (non-technical copy only in UI; these routes are plain JSON).
 */

const { Router } = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');
const ctrl = require('../controllers/setup.controller');

const r = Router();

r.use(authenticate);
r.use(requireRole('ADMIN', 'HR'));

r.get('/status', ctrl.getStatus);
r.post('/start', ctrl.start);
r.post('/work-hours', ctrl.workHours);
r.post('/test-device', ctrl.testDevice);
r.post('/device', ctrl.device);
r.post('/import-employees', ctrl.importEmployees);
r.post('/complete', ctrl.complete);

module.exports = r;
