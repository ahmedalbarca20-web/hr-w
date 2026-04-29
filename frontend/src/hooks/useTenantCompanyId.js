import { useMemo, useState, useEffect } from 'react';
import { getActiveTenantCompanyId, HR_ACTIVE_TENANT_EVENT } from '../utils/tenantScope';

/**
 * Re-computes when `user` changes or when `hr:active-tenant` fires (e.g. after login auto-pick).
 */
export function useTenantCompanyId(user) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const h = () => setTick((x) => x + 1);
    window.addEventListener(HR_ACTIVE_TENANT_EVENT, h);
    return () => window.removeEventListener(HR_ACTIVE_TENANT_EVENT, h);
  }, []);
  return useMemo(() => getActiveTenantCompanyId(user), [user, tick]);
}
