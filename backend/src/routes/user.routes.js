'use strict';

/**
 * User management routes (ADMIN only)
 *
 * GET    /api/users         – list users in company
 * POST   /api/users         – create user
 * GET    /api/users/:id     – get user
 * PUT    /api/users/:id     – update user (role, email, active, password)
 * PATCH  /api/users/:id/password – reset password (ADMIN or super-admin)
 * DELETE /api/users/:id/permanent – permanently delete user (ADMIN)
 * DELETE /api/users/:id     – deactivate user
 *
 * Announcement routes (all authenticated; write = ADMIN)
 *
 * GET    /api/users/announcements         – list announcements
 * POST   /api/users/announcements         – create (ADMIN)
 * GET    /api/users/announcements/:id     – get one
 * PUT    /api/users/announcements/:id     – update (ADMIN)
 * DELETE /api/users/announcements/:id     – delete (ADMIN)
 */

const { Router } = require('express');
const ctrl = require('../controllers/user.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole, requireFeature }  = require('../middleware/role.middleware');

const r = Router();

r.use(authenticate);
r.use(requireFeature('users'));

// ── User management ──────────────────────────────────────────────────────────

r.get   ('/',    requireRole('ADMIN', 'HR'), ctrl.listUsers);
r.get   ('/roles', requireRole('ADMIN', 'HR'), ctrl.listUserRoles);
r.post  ('/',    requireRole('ADMIN', 'HR'), ctrl.createUser);
r.get   ('/:id', requireRole('ADMIN', 'HR'), ctrl.getUser);
r.put   ('/:id', requireRole('ADMIN', 'HR'), ctrl.updateUser);
r.patch ('/:id/password', requireRole('ADMIN', 'HR'), ctrl.resetPassword);
r.delete('/:id/permanent', requireRole('ADMIN'), ctrl.permanentDeleteUser);
r.delete('/:id', requireRole('ADMIN', 'HR'), ctrl.deactivateUser);

module.exports = r;
