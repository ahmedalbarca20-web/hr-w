'use strict';

/**
 * Department Routes
 *
 * GET    /departments        — list all departments
 * POST   /departments        — create department
 * GET    /departments/:id    — get one
 * PUT    /departments/:id    — update
 * DELETE /departments/:id    — delete (blocked if employees attached)
 */

const { Router }         = require('express');
const deptController     = require('../controllers/department.controller');
const { authenticate }   = require('../middleware/auth.middleware');
const { requireRole, requireFeature } = require('../middleware/role.middleware');
const asyncHandler       = require('../utils/asyncHandler');

const router = Router();

router.use(authenticate);
router.use(requireFeature('departments'));

router.get('/',       asyncHandler(deptController.list));
router.get('/:id',    asyncHandler(deptController.getOne));

router.post('/',      requireRole('ADMIN', 'HR'), asyncHandler(deptController.create));
router.put('/:id',    requireRole('ADMIN', 'HR'), asyncHandler(deptController.update));
router.delete('/:id', requireRole('ADMIN'),       asyncHandler(deptController.remove));

module.exports = router;

