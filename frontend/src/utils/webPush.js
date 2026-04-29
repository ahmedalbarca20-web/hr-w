import { getWebPushPublicKey, subscribeWebPush } from '../api/notification.api';
import { getActiveTenantCompanyId } from './tenantScope';

/** Stable error codes thrown from enableWebPushNow (after normalization). */
const PUSH_CODES = new Set([
  'not_supported',
  'secure_context_required',
  'not_logged_in',
  'company_context_required',
  'permission_denied',
  'server_not_configured',
  'session_expired',
  'forbidden',
  'validation_failed',
  'server_error',
  'network_offline',
  'sw_register_failed',
  'subscription_failed',
  'enable_failed',
]);

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

function normalizeWebPushError(err) {
  if (err instanceof Error && PUSH_CODES.has(err.message)) return err;

  const st = err?.response?.status;
  if (st === 503) return new Error('server_not_configured');
  if (st === 401) return new Error('session_expired');
  if (st === 403) return new Error('forbidden');
  if (st === 422) return new Error('validation_failed');
  if (typeof st === 'number' && st >= 500) return new Error('server_error');

  if (!err?.response && (err?.code === 'ERR_NETWORK' || err?.message === 'Network Error')) {
    return new Error('network_offline');
  }

  const nm = err?.name;
  if (nm === 'NotSupportedError' || nm === 'SecurityError') return new Error('not_supported');
  if (nm === 'NotAllowedError') return new Error('permission_denied');

  const msg = String(err?.message || '');
  if (/Failed to register a ServiceWorker|service worker|ServiceWorker/i.test(msg)) {
    return new Error('sw_register_failed');
  }
  if (/subscribe|applicationServerKey|InvalidAccessError|InvalidStateError/i.test(msg)) {
    return new Error('subscription_failed');
  }

  return new Error('enable_failed');
}

/**
 * Human-readable message for UI (Arabic defaults via i18n fallbacks).
 * @param {(key: string, fallback: string) => string} t
 * @param {unknown} err
 */
export function messageForWebPushError(t, err) {
  const code = err instanceof Error && PUSH_CODES.has(err.message) ? err.message : 'enable_failed';
  const map = {
    not_supported: [
      'notifications.err_not_supported',
      'المتصفح لا يدعم Web Push بهذه الطريقة. على آيفون: أضف الموقع للشاشة الرئيسية (PWA) ثم افتح التطبيق من الأيقونة.',
    ],
    secure_context_required: [
      'notifications.secure_required',
      'التنبيهات تحتاج اتصالًا آمناً (HTTPS).',
    ],
    not_logged_in: [
      'notifications.err_not_logged_in',
      'انتهت الجلسة أو لم يتم تسجيل الدخول. سجّل الدخول ثم أعد المحاولة.',
    ],
    company_context_required: [
      'notifications.company_required',
      'اختر شركة أولاً ثم أعد المحاولة.',
    ],
    permission_denied: [
      'notifications.denied',
      'تم رفض الإذن. فعّل الإشعارات من إعدادات المتصفح أو الموقع.',
    ],
    server_not_configured: [
      'notifications.server_not_configured',
      'الخادم غير مهيأ للتنبيهات: أضف VAPID_PUBLIC_KEY و VAPID_PRIVATE_KEY و VAPID_SUBJECT في متغيرات بيئة الـ API.',
    ],
    session_expired: [
      'notifications.err_session_expired',
      'انتهت صلاحية الجلسة. حدّث الصفحة أو سجّل الدخول من جديد.',
    ],
    forbidden: [
      'notifications.err_forbidden',
      'لا صلاحية لتسجيل التنبيهات لهذا السياق.',
    ],
    validation_failed: [
      'notifications.err_validation',
      'بيانات غير صالحة. حدّث الصفحة ثم أعد المحاولة.',
    ],
    server_error: [
      'notifications.err_server',
      'خطأ من الخادم أثناء تفعيل التنبيهات. جرّب لاحقاً.',
    ],
    network_offline: [
      'notifications.err_network',
      'لا يوجد اتصال بالإنترنت أو تعذر الوصول للخادم.',
    ],
    sw_register_failed: [
      'notifications.err_sw',
      'تعذر تسجيل Service Worker. تأكد أن الموقع يُفتح من نفس الرابط (مثلاً من أيقونة PWA) وأن ملف sw.js متاح.',
    ],
    subscription_failed: [
      'notifications.err_subscription',
      'تعذر إنشاء اشتراك الإشعارات. جرّب متصفحاً آخر أو حدّث النظام.',
    ],
    enable_failed: [
      'notifications.enable_failed',
      'تعذر تفعيل التنبيهات حالياً.',
    ],
  };
  const [key, fb] = map[code] || map.enable_failed;
  return t(key, fb);
}

/**
 * Registers service worker + push subscription after login (HTTPS or localhost).
 * Safe to call multiple times; updates subscription on server.
 */
export async function tryRegisterWebPush() {
  try { await enableWebPushNow(); } catch { /* optional feature */ }
}

export async function enableWebPushNow() {
  try {
    if (typeof window === 'undefined') throw new Error('not_supported');
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('not_supported');
    const isLocalhost = /^localhost$|^127\.0\.0\.1$/i.test(window.location.hostname);
    if (!isLocalhost && !window.isSecureContext) throw new Error('secure_context_required');

    const raw = localStorage.getItem('user');
    if (!raw) throw new Error('not_logged_in');
    let user;
    try {
      user = JSON.parse(raw);
    } catch {
      throw new Error('not_logged_in');
    }
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

    let reg;
    try {
      reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
    } catch (e) {
      throw normalizeWebPushError(e);
    }

    let keyBytes;
    try {
      keyBytes = urlBase64ToUint8Array(publicKey);
    } catch {
      throw new Error('server_not_configured');
    }

    let sub;
    try {
      sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes,
        });
      }
    } catch (e) {
      throw normalizeWebPushError(e);
    }

    try {
      await subscribeWebPush({
        company_id: companyId,
        subscription: sub.toJSON(),
      });
    } catch (e) {
      throw normalizeWebPushError(e);
    }
  } catch (err) {
    throw normalizeWebPushError(err);
  }
}
