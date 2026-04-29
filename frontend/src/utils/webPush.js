import { getWebPushPublicKey, subscribeWebPush } from '../api/notification.api';
import { getActiveTenantCompanyId } from './tenantScope';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Registers service worker + push subscription after login (HTTPS or localhost).
 * Safe to call multiple times; updates subscription on server.
 */
export async function tryRegisterWebPush() {
  try { await enableWebPushNow(); } catch { /* optional feature */ }
}

export async function enableWebPushNow() {
  if (typeof window === 'undefined') throw new Error('not_supported');
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('not_supported');
  const isLocalhost = /^localhost$|^127\.0\.0\.1$/i.test(window.location.hostname);
  if (!isLocalhost && !window.isSecureContext) throw new Error('secure_context_required');

  const raw = localStorage.getItem('user');
  if (!raw) throw new Error('not_logged_in');
  const user = JSON.parse(raw);
  const companyId = getActiveTenantCompanyId(user);
  if (!companyId) throw new Error('company_context_required');

  const token = localStorage.getItem('access_token');
  if (!token) throw new Error('not_logged_in');

  let perm = Notification.permission;
  if (perm === 'default') {
    perm = await Notification.requestPermission();
  }
  if (perm !== 'granted') throw new Error('permission_denied');

  const { data: wrap } = await getWebPushPublicKey();
  const publicKey = wrap?.data?.publicKey;
  if (!publicKey || typeof publicKey !== 'string') throw new Error('server_not_configured');

  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  await subscribeWebPush({
    company_id: companyId,
    subscription: sub.toJSON(),
  });
}
