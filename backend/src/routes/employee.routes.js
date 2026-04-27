'use strict';

/**
 * Employee Routes
 *
 * GET    /employees                  — list + filter + paginate
 * POST   /employees                  — create
 * GET    /employees/:id              — get one
 * PUT    /employees/:id              — full update
 * PATCH  /employees/:id              — partial update
 * PATCH  /employees/:id/status       — status change only
 * DELETE /employees/:id              — soft-delete
 *
 * All routes require authentication.
 * requireRole guards write operations to ADMIN and HR only.
 */

const { Router }               = require('express');
const employeeController       = require('../controllers/employee.controller');
const { authenticate }         = require('../middleware/auth.middleware');
const { requireRole, requireFeature } = require('../middleware/role.middleware');
const asyncHandler             = require('../utils/asyncHandler');

const router = Router();

// All employee routes require a valid JWT
router.use(authenticate);

// Self-service profile (employee linked to JWT — does not require `employees` module)
router.get('/me', asyncHandler(employeeController.getSelf));

router.use(requireFeature('employees'));

// Read
router.get ('/',          asyncHandler(employeeController.list));
router.get ('/:id',       asyncHandler(employeeController.getOne));

// Write (ADMIN or HR only)
router.post('/',          requireRole('ADMIN', 'HR'), asyncHandler(employeeController.create));
router.put ('/:id',       requireRole('ADMIN', 'HR'), asyncHandler(employeeController.update));
router.patch('/:id',      requireRole('ADMIN', 'HR'), asyncHandler(employeeController.patch));
router.patch('/:id/status', requireRole('ADMIN', 'HR'), asyncHandler(employeeController.changeStatus));
router.delete('/:id',     requireRole('ADMIN'),       asyncHandler(employeeController.remove));

module.exports = router;

