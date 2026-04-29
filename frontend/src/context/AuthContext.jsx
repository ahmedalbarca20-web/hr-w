import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as authApi from '../api/auth.api';
import { listCompanies } from '../api/company.api';
import { toErrorString } from '../utils/helpers';
import {
  HR_ACTIVE_COMPANY_KEY,
  HR_ACTIVE_TENANT_EVENT,
  isSuperAdminUser,
} from '../utils/tenantScope';

async function ensureSuperAdminTenantSelection() {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return;
    const u = JSON.parse(raw);
    if (!isSuperAdminUser(u)) return;
    const own = Number(u.company_id);
    if (Number.isInteger(own) && own > 0) return;
    const cur = Number(localStorage.getItem(HR_ACTIVE_COMPANY_KEY));
    if (Number.isInteger(cur) && cur > 0) return;
    const { data } = await listCompanies({ limit: 100 });
    const rows = Array.isArray(data?.data) ? data.data : [];
    const active = rows.find((c) => Number(c.is_active) === 1) || rows[0];
    if (active?.id) {
      localStorage.setItem(HR_ACTIVE_COMPANY_KEY, String(active.id));
      window.dispatchEvent(new Event(HR_ACTIVE_TENANT_EVENT));
    }
  } catch {
    /* non-fatal: super admin can open Companies and work without auto-pick */
  }
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]           = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')); }
    catch { return null; }
  });
  // true while we are verifying the stored session on first mount
  const [initializing, setInitializing] = useState(!!localStorage.getItem('access_token'));
  const [loading, setLoading]     = useState(false);
  const navigate                  = useNavigate();

  // Flag: suppress auth:logout events fired during the init verification phase
  // (we don't want a stale-token cleanup to kick out a user who just logged in)
  const isInitPhase = useRef(!!localStorage.getItem('access_token'));

  // ── Verify stored token once on mount ────────────────────────────────────
  useEffect(() => {
    if (!localStorage.getItem('access_token')) {
      setInitializing(false);
      return;
    }
    authApi.me()
      .then(async ({ data }) => {
        const raw = data.data;
        if (!raw) return;
        // Normalize: /auth/me returns full Sequelize object; we need the same
        // flat shape that login() stores: { id, email, company_id, role (string),
        // is_super_admin, permissions }
        const normalized = {
          id            : raw.id,
          email         : raw.email,
          company_id    : raw.company_id ?? null,
          employee_id   : raw.employee_id ?? null,
          role          : (typeof raw.role === 'object' ? raw.role?.name : raw.role) ?? '',
          is_super_admin: typeof raw.role === 'object'
                          ? raw.role?.name === 'SUPER_ADMIN'
                          : raw.is_super_admin ?? false,
          permissions   : Array.isArray(raw.role?.permissions)
                          ? raw.role.permissions
                          : (raw.permissions ?? []),
          company_features: Array.isArray(raw.company_features) ? raw.company_features : [],
        };
        localStorage.setItem('user', JSON.stringify(normalized));
        setUser(normalized);
        await ensureSuperAdminTenantSelection();
      })
      .catch(() => {
        // Refresh already tried by axios interceptor — if we still fail, clear out
        localStorage.removeItem('access_token');
        localStorage.removeItem('user');
        localStorage.removeItem(HR_ACTIVE_COMPANY_KEY);
        setUser(null);
      })
      .finally(() => {
        isInitPhase.current = false;
        setInitializing(false);
      });
  }, []);

  // ── Listen for silent-logout event emitted by axios interceptor ──────────
  useEffect(() => {
    const handler = () => {
      // Ignore events fired during the init phase — they are just stale-token
      // cleanups and must NOT interrupt an active login attempt
      if (isInitPhase.current) return;
      setUser(null);
      navigate('/login', { replace: true });
    };
    window.addEventListener('auth:logout', handler);
    return () => window.removeEventListener('auth:logout', handler);
  }, [navigate]);

  const persistSession = (payload) => {
    const token = payload?.accessToken || payload?.access_token;
    if (!token) return false;
    const normalizedUser = {
      ...payload.user,
      company_features: Array.isArray(payload?.user?.company_features) ? payload.user.company_features : [],
    };
    localStorage.setItem('access_token', token);
    localStorage.setItem('user', JSON.stringify(normalizedUser));
    setUser(normalizedUser);
    return true;
  };

  const hasFeature = useCallback((featureKey) => {
    if (!user) return false;
    if (user.is_super_admin || user.role === 'SUPER_ADMIN') return true;
    const enabled = Array.isArray(user.company_features) ? user.company_features : [];
    return enabled.includes(String(featureKey || '').toLowerCase());
  }, [user]);

  const login = useCallback(async (email, password, extras = {}) => {
    setLoading(true);
    try {
      const { data } = await authApi.login({ email, password, ...extras });
      const ok = persistSession(data.data);
      if (!ok) return { ok: false, msg: 'Login response invalid' };
      await ensureSuperAdminTenantSelection();
      return { ok: true };
    } catch (err) {
      const raw = err.response?.data?.error ?? err.response?.data?.message ?? err.message;
      return { ok: false, msg: toErrorString(raw, 'Login failed') };
    } finally {
      setLoading(false);
    }
  }, []);

  const loginEmployee = useCallback(async (employee_code, password, company_code = '') => {
    setLoading(true);
    try {
      const { data } = await authApi.employeeLogin({ employee_code, password, company_code: company_code || null });
      const ok = persistSession(data.data);
      if (!ok) return { ok: false, msg: 'Login response invalid' };
      await ensureSuperAdminTenantSelection();
      return { ok: true };
    } catch (err) {
      const raw = err.response?.data?.error ?? err.response?.data?.message ?? err.message;
      return { ok: false, msg: toErrorString(raw, 'Login failed') };
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try { await authApi.logout(); } catch {}
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    localStorage.removeItem(HR_ACTIVE_COMPANY_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, initializing, login, loginEmployee, logout, hasFeature, isAuth: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
export default AuthContext;

