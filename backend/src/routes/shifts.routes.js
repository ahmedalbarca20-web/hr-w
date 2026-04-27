'use strict';

/**
 * Work Shift routes
 *
 * GET    /api/shifts              – list shifts              (HR + ADMIN)
 * POST   /api/shifts              – create shift             (ADMIN)
 * GET    /api/shifts/:id          – get one                  (HR + ADMIN)
 * PUT    /api/shifts/:id          – update                   (ADMIN)
 * DELETE /api/shifts/:id          – deactivate               (ADMIN)
 * POST   /api/shifts/:id/set-default – set company default   (ADMIN)
 */

const { Router }    = require('express');
const ctrl          = require('../controllers/shifts.controller');
const { authenticate }  = require('../middleware/auth.middleware');
const { requireRole, requireFeature } = require('../middleware/role.middleware');

const r        = Router();
const HR_ADMIN = ['ADMIN', 'HR'];

r.use(authenticate);
r.use(requireFeature('shifts'));

// ── Read (HR + ADMIN) ────────────────────────────────────────────────────────
r.get('/',    ctrl.list);
r.get('/:id', ctrl.getOne);

// ── Write (ADMIN only) ───────────────────────────────────────────────────────
r.post('/',                    requireRole('ADMIN'), ctrl.create);
r.put ('/:id',                 requireRole('ADMIN'), ctrl.update);
r.delete('/:id',               requireRole('ADMIN'), ctrl.deactivate);
r.post ('/:id/set-default',    requireRole('ADMIN'), ctrl.setDefault);

module.exports = r;
