/**
 * Tenant scope for API calls and pages.
 * Super-admin JWT may have company_id null; we then use localStorage hr_active_company_id.
 */

export const HR_ACTIVE_COMPANY_KEY = 'hr_active_company_id';
/** Fired on same window when active tenant id is set or changed (super-admin). */
export const HR_ACTIVE_TENANT_EVENT = 'hr:active-tenant';

export function isSuperAdminUser(user) {
  if (!user) return false;
  const r = typeof user.role === 'object' ? user.role?.name : user.role;
  return Boolean(user.is_super_admin) || String(r || '').toUpperCase() === 'SUPER_ADMIN';
}

/**
 * Effective company id for tenant-scoped UI and payloads.
 * @param {object|null} user normalized user from AuthContext
 * @returns {number|null}
 */
export function getActiveTenantCompanyId(user) {
  if (!user) return null;
  const n = Number(user.company_id);
  if (Number.isInteger(n) && n > 0) return n;
  if (!isSuperAdminUser(user)) return null;
  if (typeof window === 'undefined') return null;
  const ls = Number(localStorage.getItem(HR_ACTIVE_COMPANY_KEY));
  return Number.isInteger(ls) && ls > 0 ? ls : null;
}
