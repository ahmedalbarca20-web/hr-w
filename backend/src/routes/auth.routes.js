'use strict';

/**
 * Auth Routes
 *
 * POST   /auth/login    — public
 * POST   /auth/refresh  — public (uses httpOnly cookie)
 * POST   /auth/logout   — protected
 * GET    /auth/me       — protected
 */

const { Router }         = require('express');
const authController     = require('../controllers/auth.controller');
const { authenticate }   = require('../middleware/auth.middleware');
const asyncHandler       = require('../utils/asyncHandler');

const router = Router();

// Public endpoints
router.post('/login',   asyncHandler(authController.login));
router.post('/employee-login', asyncHandler(authController.employeeLogin));
router.post('/refresh', asyncHandler(authController.refresh));
router.post('/request-reset', asyncHandler(authController.requestReset));
router.post('/reset-password', asyncHandler(authController.resetPassword));

// Protected endpoints
router.post('/logout', authenticate, asyncHandler(authController.logout));
router.get ('/me',     authenticate, asyncHandler(authController.getMe));

module.exports = router;

