'use strict';

const crypto = require('crypto');
const { Op } = require('sequelize');
const webpush = require('web-push');
const PushSubscription = require('../models/push_subscription.model');
const User = require('../models/user.model');
const Role = require('../models/role.model');

function endpointHash(endpoint) {
  return crypto.createHash('sha256').update(String(endpoint), 'utf8').digest('hex');
}

function isWebPushConfigured() {
  const pub = String(process.env.VAPID_PUBLIC_KEY || '').trim();
  const prv = String(process.env.VAPID_PRIVATE_KEY || '').trim();
  return Boolean(pub && prv);
}

let vapidReady = false;

function ensureVapidConfigured() {
  if (!isWebPushConfigured()) return false;
  if (!vapidReady) {
    const subject = String(process.env.VAPID_SUBJECT || 'mailto:hr@localhost').trim();
    webpush.setVapidDetails(
      subject,
      process.env.VAPID_PUBLIC_KEY.trim(),
      process.env.VAPID_PRIVATE_KEY.trim(),
    );
    vapidReady = true;
  }
  return true;
}

function appOrigin() {
  const raw = String(process.env.CLIENT_URL || 'http://localhost:3000').split(',')[0].trim();
  return raw.replace(/\/$/, '');
}

function defaultOpenUrl(path = '/') {
  const p = String(path || '/').startsWith('/') ? String(path || '/') : `/${path || ''}`;
  return `${appOrigin()}${p}`;
}

async function removeDeadSubscription(endpoint) {
  await PushSubscription.destroy({ where: { endpoint_hash: endpointHash(endpoint) } });
}

/**
 * @param {import('web-push').PushSubscription} sub
 * @param {{ title: string, body?: string, url?: string, tag?: string }} payload
 */
async function sendToSubscription(sub, payload) {
  if (!ensureVapidConfigured()) return;
  const body = JSON.stringify({
    title: payload.title,
    body: payload.body || '',
    data: { url: payload.url || `${appOrigin()}/`, tag: payload.tag || 'hr' },
  });
  try {
    await webpush.sendNotification(sub, body, { TTL: 3600 });
  } catch (err) {
    const status = err?.statusCode;
    if (status === 404 || status === 410) {
      await removeDeadSubscription(sub.endpoint);
      return;
    }
    throw err;
  }
}

async function sendToUserIds(userIds, payload) {
  if (!userIds?.length || !ensureVapidConfigured()) return;
  const uniq = [...new Set(userIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!uniq.length) return;
  const rows = await PushSubscription.findAll({ where: { user_id: { [Op.in]: uniq } } });
  await Promise.all(rows.map((row) => sendToSubscription({
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
  }, payload)));
}

/** Notify ADMIN/HR in a company (emergency attendance request). */
async function notifyCompanyAdminsHr(company_id, payload) {
  if (!company_id || !ensureVapidConfigured()) return;
  const users = await User.findAll({
    where: { company_id, is_active: 1 },
    attributes: ['id'],
    include: [{
      model: Role,
      as: 'role',
      attributes: [],
      where: { name: { [Op.in]: ['ADMIN', 'HR'] } },
      required: true,
    }],
  });
  const ids = users.map((u) => u.id);
  await sendToUserIds(ids, payload);
}

/** Notify every active user in company who has a push subscription (surprise attendance). */
async function notifyCompanyAllSubscribers(company_id, payload) {
  if (!company_id || !ensureVapidConfigured()) return;
  const staff = await User.findAll({
    where: { company_id, is_active: 1 },
    attributes: ['id'],
  });
  const ids = staff.map((u) => u.id);
  if (!ids.length) return;
  const rows = await PushSubscription.findAll({ where: { user_id: { [Op.in]: ids } } });
  await Promise.all(rows.map((row) => sendToSubscription({
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
  }, payload)));
}

/** Notify a single user (e.g. employee after review). */
async function notifyUser(user_id, payload) {
  await sendToUserIds([user_id], payload);
}

module.exports = {
  isWebPushConfigured,
  getVapidPublicKey: () => String(process.env.VAPID_PUBLIC_KEY || '').trim(),
  defaultOpenUrl,
  endpointHash,
  sendToUserIds,
  notifyCompanyAdminsHr,
  notifyCompanyAllSubscribers,
  notifyUser,
  removeDeadSubscription,
};
