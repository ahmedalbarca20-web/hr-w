'use strict';

/**
 * Announcement routes
 *
 * GET    /api/announcements         – list (all authenticated; filtered by role)
 * POST   /api/announcements         – create (ADMIN)
 * GET    /api/announcements/:id     – get one
 * PUT    /api/announcements/:id     – update (ADMIN)
 * DELETE /api/announcements/:id     – delete (ADMIN)
 */

const { Router } = require('express');
const ctrl = require('../controllers/user.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole, requireFeature }  = require('../middleware/role.middleware');

const r = Router();

r.use(authenticate);
r.use(requireFeature('announcements'));

r.get   ('/',    ctrl.listAnnouncements);
r.post  ('/',    requireRole('ADMIN'), ctrl.createAnnouncement);
r.get   ('/:id', ctrl.getAnnouncement);
r.put   ('/:id', requireRole('ADMIN'), ctrl.updateAnnouncement);
r.delete('/:id', requireRole('ADMIN'), ctrl.deleteAnnouncement);

module.exports = r;
