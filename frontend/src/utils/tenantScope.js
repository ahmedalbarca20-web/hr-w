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
  const isSuperAdmin = isSuperAdminUser(user);
  if (!isSuperAdmin) {
    const companyId = Number(user.company_id);
    return Number.isInteger(companyId) && companyId > 0 ? companyId : null;
  }
  if (typeof window !== 'undefined') {
    const active = Number(localStorage.getItem(HR_ACTIVE_COMPANY_KEY));
    if (Number.isInteger(active) && active > 0) return active;
  }
  const companyId = Number(user.company_id);
  return Number.isInteger(companyId) && companyId > 0 ? companyId : null;
}
