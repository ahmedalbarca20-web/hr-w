'use strict';

/**
 * Leave routes
 *
 * GET  /api/leaves/types              – list types (AUTH)
 * POST /api/leaves/types              – create type (ADMIN)
 * PUT  /api/leaves/types/:id          – update (ADMIN)
 * DELETE /api/leaves/types/:id        – deactivate (ADMIN)
 *
 * GET  /api/leaves/balances           – list balances (AUTH; employee sees own)
 * POST /api/leaves/balances           – set balance (HR|ADMIN)
 *
 * GET  /api/leaves/requests           – list requests (AUTH; employee sees own)
 * POST /api/leaves/requests           – submit request (AUTH, needs employee_id)
 * GET  /api/leaves/requests/:id       – get one
 * PATCH /api/leaves/requests/:id/review – approve|reject (HR|ADMIN)
 * PATCH /api/leaves/requests/:id/cancel – cancel (own or HR|ADMIN)
 */

const { Router } = require('express');
const ctrl = require('../controllers/leave.controller');
const { authenticate }  = require('../middleware/auth.middleware');
const { requireRole, requireFeature } = require('../middleware/role.middleware');

const r = Router();
const HR_ADMIN = ['ADMIN','HR'];

r.use(authenticate);
r.use(requireFeature('leaves'));

// Types
r.get   ('/types',                  ctrl.listTypes);
r.post  ('/types',                  requireRole('ADMIN'), ctrl.createType);
r.put   ('/types/:id',              requireRole('ADMIN'), ctrl.updateType);
r.delete('/types/:id',              requireRole('ADMIN'), ctrl.deactivateType);

// Balances
r.get   ('/balances',               ctrl.listBalances);
r.post  ('/balances',               requireRole(...HR_ADMIN), ctrl.setBalance);

// Requests
r.get   ('/requests',               ctrl.listRequests);
r.post  ('/requests',               ctrl.createRequest);
r.get   ('/requests/:id',           ctrl.getRequest);
r.patch ('/requests/:id/review',    requireRole(...HR_ADMIN), ctrl.reviewRequest);
r.patch ('/requests/:id/cancel',    ctrl.cancelRequest);

module.exports = r;

