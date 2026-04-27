'use strict';

export const ACTIVITY_STORAGE_KEY = 'hr_activity_log_v1';
const MAX = 40;
const EVENT = 'hr-activity-log';
const ACTIVE_COMPANY_KEY = 'hr_active_company_id';

function getCurrentScope() {
  try {
    const u = JSON.parse(localStorage.getItem('user') || 'null');
    if (!u) return 'anon';
    const isSuper = Boolean(u.is_super_admin) || String(u.role || '').toUpperCase() === 'SUPER_ADMIN';
    if (isSuper) {
      const selected = Number(localStorage.getItem(ACTIVE_COMPANY_KEY));
      if (Number.isInteger(selected) && selected > 0) return `company:${selected}`;
      // Super admin without selected company gets isolated own scope.
      return 'super';
    }
    if (u.company_id != null && u.company_id !== '') return `company:${u.company_id}`;
    return 'no-company';
  } catch {
    return 'anon';
  }
}

function scopeStorageKey(scope) {
  return `${ACTIVITY_STORAGE_KEY}:${scope}`;
}

/** @param {import('axios').AxiosResponse} res */
export function logSuccessfulMutation(res) {
  const cfg = res?.config;
  if (!cfg) return;
  const method = String(cfg.method || 'get').toLowerCase();
  if (!['post', 'put', 'patch', 'delete'].includes(method)) return;

  let path = String(cfg.url || '').split('?')[0];
  if (path.startsWith('http')) {
    try {
      path = new URL(path).pathname;
    } catch {
      return;
    }
  }
  path = path.replace(/^\/api\b/i, '') || '/';
  if (!path.startsWith('/')) path = `/${path}`;

  if (path.startsWith('/auth/')) return;

  const entry = {
    id   : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    at   : new Date().toISOString(),
    method,
    path,
    status: res.status,
  };
  const scope = getCurrentScope();
  const storageKey = scopeStorageKey(scope);

  let list = [];
  try {
    list = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (!Array.isArray(list)) list = [];
  } catch {
    list = [];
  }
  list.unshift(entry);
  const trimmed = list.slice(0, MAX);
  localStorage.setItem(storageKey, JSON.stringify(trimmed));
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { scope, list: trimmed } }));
}

export function getActivityLog() {
  const scope = getCurrentScope();
  const storageKey = scopeStorageKey(scope);
  try {
    const list = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function onActivityLog(callback) {
  const localHandler = () => callback(getActivityLog());
  const storageHandler = (e) => {
    const scope = getCurrentScope();
    const currentKey = scopeStorageKey(scope);
    if (e.key === currentKey || e.key === ACTIVE_COMPANY_KEY || e.key === 'user' || e.key === null) {
      callback(getActivityLog());
    }
  };
  window.addEventListener(EVENT, localHandler);
  window.addEventListener('storage', storageHandler);
  return () => {
    window.removeEventListener(EVENT, localHandler);
    window.removeEventListener('storage', storageHandler);
  };
}

export function firstResourceSegment(path) {
  const parts = path.split('/').filter(Boolean);
  return (parts[0] || 'other').toLowerCase();
}

const RESOURCE_STYLE = {
  employees   : { icon: 'group', color: '#9c27b0' },
  departments : { icon: 'account_tree', color: '#7b1fa2' },
  attendance  : { icon: 'access_time', color: '#00bcd4' },
  leaves        : { icon: 'event_note', color: '#4caf50' },
  payroll       : { icon: 'payments', color: '#ff9800' },
  devices       : { icon: 'router', color: '#00acc1' },
  announcements : { icon: 'campaign', color: '#ab47bc' },
  users         : { icon: 'manage_accounts', color: '#5e35b1' },
  shifts        : { icon: 'schedule', color: '#00897b' },
  process       : { icon: 'engineering', color: '#546e7a' },
  companies     : { icon: 'domain', color: '#3949ab' },
  settings      : { icon: 'settings', color: '#607d8b' },
  dashboard     : { icon: 'insights', color: '#0288d1' },
};

export function styleForResource(segment) {
  return RESOURCE_STYLE[segment] || { icon: 'edit_note', color: '#78909c' };
}

/** @param {string} iso */
/**
 * Human-readable line for dashboard (uses i18n).
 * @param {{ method: string, path: string }} entry
 * @param {import('i18next').TFunction} t
 */
export function describeActivity(entry, t) {
  const seg = firstResourceSegment(entry.path);
  const resource = t(`activity.resource.${seg}`, { defaultValue: seg });
  const verb = t(`activity.verb.${entry.method}`, { defaultValue: entry.method.toUpperCase() });
  return t('activity.line', { verb, resource });
}

export function formatRelativeTime(iso, lang) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const sec = Math.round((Date.now() - then) / 1000);
  const loc = lang === 'ar' ? 'ar' : 'en';
  const rtf = new Intl.RelativeTimeFormat(loc, { numeric: 'auto' });
  if (Math.abs(sec) < 60) return rtf.format(-sec, 'second');
  const min = Math.round(sec / 60);
  if (Math.abs(min) < 60) return rtf.format(-min, 'minute');
  const hr = Math.round(min / 60);
  if (Math.abs(hr) < 48) return rtf.format(-hr, 'hour');
  const day = Math.round(hr / 24);
  if (Math.abs(day) < 14) return rtf.format(-day, 'day');
  return new Date(iso).toLocaleString(loc);
}
