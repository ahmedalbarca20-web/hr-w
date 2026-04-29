'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/response');
const { pushWebPushSubscribeSchema, pushWebPushUnsubscribeSchema } = require('../utils/validators');
const PushSubscription = require('../models/push_subscription.model');
const pushSvc = require('../services/push_notification.service');

const resolveSubscribeCompanyId = (req) => {
  const fromBody = Number(req.body?.company_id);
  if (Number.isInteger(fromBody) && fromBody > 0) return fromBody;
  const own = Number(req.user.company_id);
  return Number.isInteger(own) && own > 0 ? own : null;
};

exports.getWebPushPublicKey = asyncHandler(async (_req, res) => {
  const key = pushSvc.getVapidPublicKey();
  if (!key) {
    return sendError(res, 'Web push is not configured on server', 503, 'SERVICE_UNAVAILABLE');
  }
  return sendSuccess(res, { publicKey: key });
});

exports.subscribeWebPush = asyncHandler(async (req, res) => {
  const parsed = pushWebPushSubscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, parsed.error.issues[0]?.message || 'Invalid body', 422, 'VALIDATION_ERROR');
  }
  if (!pushSvc.isWebPushConfigured()) {
    return sendError(res, 'Web push is not configured on server', 503, 'SERVICE_UNAVAILABLE');
  }
  const companyId = resolveSubscribeCompanyId(req);
  if (!companyId) {
    return sendError(res, 'company_id is required to register push for this session', 422, 'VALIDATION_ERROR');
  }
  if (!req.user.is_super_admin) {
    const own = Number(req.user.company_id);
    if (!Number.isInteger(own) || own !== companyId) {
      return sendError(res, 'company_id does not match your account', 403, 'FORBIDDEN');
    }
  }

  const sub = parsed.data.subscription;
  const h = pushSvc.endpointHash(sub.endpoint);
  await PushSubscription.destroy({ where: { user_id: req.user.sub, endpoint_hash: h } });
  await PushSubscription.create({
    user_id      : req.user.sub,
    company_id   : companyId,
    endpoint_hash: h,
    endpoint     : sub.endpoint,
    p256dh       : sub.keys.p256dh,
    auth         : sub.keys.auth,
    user_agent   : String(req.get('user-agent') || '').slice(0, 512),
  });
  return sendSuccess(res, { ok: true }, 'Push subscription saved');
});

exports.unsubscribeWebPush = asyncHandler(async (req, res) => {
  const parsed = pushWebPushUnsubscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, parsed.error.issues[0]?.message || 'Invalid body', 422, 'VALIDATION_ERROR');
  }
  const h = pushSvc.endpointHash(parsed.data.endpoint);
  await PushSubscription.destroy({ where: { user_id: req.user.sub, endpoint_hash: h } });
  return sendSuccess(res, { ok: true }, 'Push subscription removed');
});
