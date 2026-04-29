'use strict';

const { Router } = require('express');
const ctrl = require('../controllers/notification.controller');
const { authenticate } = require('../middleware/auth.middleware');
const asyncHandler = require('../utils/asyncHandler');

const r = Router();

r.get('/web-push-public-key', asyncHandler(ctrl.getWebPushPublicKey));

r.use(authenticate);

r.post('/web-push/subscribe', asyncHandler(ctrl.subscribeWebPush));
r.post('/web-push/unsubscribe', asyncHandler(ctrl.unsubscribeWebPush));

module.exports = r;
