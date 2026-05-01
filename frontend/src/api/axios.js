import axios from 'axios';
import { logSuccessfulMutation } from '../utils/activityLog';
import { HR_ACTIVE_COMPANY_KEY } from '../utils/tenantScope';

const rawApiBase = String(import.meta.env.VITE_API_BASE_URL || '').trim();
const isBrowser = typeof window !== 'undefined';
const currentOrigin = isBrowser ? window.location.origin : '';
const currentHost = isBrowser ? window.location.host : '';

const isAbsoluteHttpUrl = (v) => /^https?:\/\//i.test(v);
const shouldForceSameOriginApi = () => {
  if (!isBrowser || !rawApiBase || !isAbsoluteHttpUrl(rawApiBase)) return false;
  // On Vercel preview URLs, forcing same-origin '/api' avoids cross-origin preflight failures.
  const isPreviewHost = /\.vercel\.app$/i.test(currentHost) && !/^hr-w-frontend\.vercel\.app$/i.test(currentHost);
  return isPreviewHost;
};

/** Dev: opened as http://192.168.x.x:3000 but .env points API to localhost — browser would hit wrong machine. */
const devLanShouldUseProxy = () => {
  if (!import.meta.env.DEV || !isBrowser || !rawApiBase || !isAbsoluteHttpUrl(rawApiBase)) return false;
  if (!currentHost || /^(localhost|127\.0\.0\.1)(:|$)/i.test(currentHost)) return false;
  return /^(https?:\/\/)(localhost|127\.0\.0\.1)(:|\/|$)/i.test(rawApiBase);
};

const apiBase = devLanShouldUseProxy()
  ? `${currentOrigin}/api`
  : (shouldForceSameOriginApi() ? `${currentOrigin}/api` : (rawApiBase || '/api'));

/** Resolved API base for authenticated `fetch` (same rules as axios `baseURL`). */
export function getResolvedApiBaseUrl() {
  if (!isBrowser) return rawApiBase || '/api';
  if (devLanShouldUseProxy()) return `${currentOrigin}/api`;
  if (shouldForceSameOriginApi()) return `${currentOrigin}/api`;
  return rawApiBase || '/api';
}

if (import.meta.env.PROD && (apiBase === '/api' || apiBase.startsWith('/'))) {
  // eslint-disable-next-line no-console
  console.warn(
    '[HR API] Using same-origin /api base URL in production.'
  );
}

const api = axios.create({
  baseURL: apiBase,
  withCredentials: true,
});

function superAdminTenantCompanyId() {
  try {
    const u = JSON.parse(localStorage.getItem('user') || 'null');
    if (!u) return null;
    const noCompany = u.company_id == null || u.company_id === '';
    const isSa = Boolean(u.is_super_admin) || u.role === 'SUPER_ADMIN';
    if (!noCompany || !isSa) return null;
    const fromLs = Number(localStorage.getItem(HR_ACTIVE_COMPANY_KEY));
    if (Number.isInteger(fromLs) && fromLs > 0) return fromLs;
    return null;
  } catch {
    return null;
  }
}

function currentUserTenantScope() {
  try {
    const u = JSON.parse(localStorage.getItem('user') || 'null');
    if (!u) return { companyId: null, isSuperAdmin: false };
    const isSuperAdmin = Boolean(u.is_super_admin) || u.role === 'SUPER_ADMIN';
    const companyId = Number(u.company_id);
    return {
      isSuperAdmin,
      companyId: Number.isInteger(companyId) && companyId > 0 ? companyId : null,
    };
  } catch {
    return { companyId: null, isSuperAdmin: false };
  }
}

// Attach access token; enforce strict tenant scope on every request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;

  const url = String(config.url || '');
  if (url.includes('/auth/login') || url.includes('/auth/refresh') || url.includes('/auth/forgot')) {
    return config;
  }

  const { isSuperAdmin, companyId: userCompanyId } = currentUserTenantScope();
  const cid = isSuperAdmin && !userCompanyId
    ? superAdminTenantCompanyId()
    : userCompanyId;
  if (cid == null) return config;

  if (!config.params) config.params = {};
  // Non-super-admin users are hard-scoped to their own company_id.
  if (!isSuperAdmin && userCompanyId) {
    config.params = { ...config.params, company_id: userCompanyId };
  } else if (config.params.company_id == null && config.params.companyId == null) {
    config.params = { ...config.params, company_id: cid };
  }

  const d = config.data;
  if (d && typeof d === 'object' && !(d instanceof FormData) && !Array.isArray(d)) {
    if (!isSuperAdmin && userCompanyId) {
      config.data = { ...d, company_id: userCompanyId };
    } else if (d.company_id == null && d.companyId == null) {
      config.data = { ...d, company_id: cid };
    }
  }

  return config;
});

// ── 401 handler: try silent token refresh before giving up ───────────────────
let _refreshing = false;
let _refreshQueue = [];

const processQueue = (error, token = null) => {
  _refreshQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token)));
  _refreshQueue = [];
};

api.interceptors.response.use(
  (res) => {
    try {
      if (res.status >= 200 && res.status < 300) logSuccessfulMutation(res);
    } catch {
      /* ignore activity log errors */
    }
    return res;
  },
  async (err) => {
    const original = err.config;

    // Only handle 401 once per request, and only when we have a stored token
    // (skip on login page / unauthenticated state, and skip auth endpoints)
    if (
      err.response?.status === 401 &&
      !original._retry &&
      localStorage.getItem('access_token') &&          // only if we HAVE a token
      !original.url?.includes('/auth/refresh') &&
      !original.url?.includes('/auth/login')
    ) {
      if (_refreshing) {
        // Queue this request until refresh completes
        return new Promise((resolve, reject) => {
          _refreshQueue.push({ resolve, reject });
        }).then((token) => {
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        });
      }

      original._retry = true;
      _refreshing = true;

      try {
        const { data } = await api.post('/auth/refresh');
        const newToken = data.data?.accessToken || data.data?.access_token;
        if (!newToken) throw new Error('No token in refresh response');

        localStorage.setItem('access_token', newToken);
        api.defaults.headers.common.Authorization = `Bearer ${newToken}`;
        original.headers.Authorization = `Bearer ${newToken}`;

        processQueue(null, newToken);
        return api(original);
      } catch (refreshErr) {
        processQueue(refreshErr);
        localStorage.removeItem('access_token');
        localStorage.removeItem('user');
        localStorage.removeItem(HR_ACTIVE_COMPANY_KEY);
        // Use React Router navigation (no full reload) via event
        window.dispatchEvent(new Event('auth:logout'));
        return Promise.reject(refreshErr);
      } finally {
        _refreshing = false;
      }
    }

    return Promise.reject(err);
  },
);

export default api;

