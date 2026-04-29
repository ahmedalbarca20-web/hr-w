import { useState, useMemo, useCallback } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLang } from '../../context/LangContext';
import { useSidebar } from '../../context/SidebarContext';
import { useAuth } from '../../context/AuthContext';
import { enableWebPushNow, messageForWebPushError } from '../../utils/webPush';
import clsx from 'clsx';

/* Keys shown under "Main" (single flat links, no duplicate reports center). */
const MAIN_NAV_KEYS = [
  'dashboard',
  'my_profile',
  'employees',
  'departments',
  'attendance',
  'leaves',
  'payroll',
  'devices_sync',
];

/* ── Navigation structure (order matters only for grouping) ───────────── */
const NAV = [
  { key: 'dashboard', path: '/', icon: 'dashboard', exact: true },
  {
    key: 'my_profile', path: '/employees/profile', icon: 'account_circle', exact: true,
    requireEmployee: true,
  },
  { key: 'employees', path: '/employees', icon: 'group', feature: 'employees' },
  { key: 'departments', path: '/departments', icon: 'account_tree', feature: 'departments' },
  { key: 'attendance', path: '/attendance', icon: 'access_time', feature: 'attendance' },
  { key: 'leaves', path: '/leaves', icon: 'event_note', feature: 'leaves' },
  { key: 'payroll', path: '/payroll', icon: 'payments', feature: 'payroll' },
  { key: 'devices_sync', path: '/devices/sync', icon: 'sync', feature: 'devices' },
  { key: 'leave_types', path: '/leaves/types', icon: 'event_available', feature: 'leaves', adminOnly: true },
  {
    key: 'devices', path: '/devices', icon: 'router', feature: 'devices',
    children: [
      { key: 'devices_overview', path: '/devices', icon: 'speed', feature: 'devices' },
      { key: 'devices_list', path: '/devices/list', icon: 'device_hub', feature: 'devices' },
      { key: 'devices_add', path: '/devices/add', icon: 'add_circle_outline', feature: 'devices' },
      { key: 'devices_logs', path: '/devices/logs', icon: 'receipt_long', feature: 'devices' },
    ],
  },
  {
    key: 'management', path: '', icon: 'admin_panel_settings',
    children: [
      { key: 'announcements', path: '/announcements', icon: 'campaign', feature: 'announcements' },
      { key: 'users', path: '/users', icon: 'manage_accounts', feature: 'users' },
      { key: 'shifts', path: '/shifts', icon: 'schedule', feature: 'shifts' },
      { key: 'process', path: '/process', icon: 'engineering', feature: 'process' },
    ],
  },
  { key: 'settings', path: '/settings', icon: 'settings' },
  { key: 'companies', path: '/companies', icon: 'domain', superAdminOnly: true },
];

function SectionLabel({ label }) {
  return (
    <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-white/25 select-none">
      {label}
    </p>
  );
}

function NavItem({ item, isRTL, depth = 0 }) {
  const location = useLocation();
  const { t } = useTranslation();
  const { close, isDesktop } = useSidebar();
  const isChildActive = item.children?.some(
    (c) => location.pathname === c.path || location.pathname.startsWith(`${c.path}/`),
  );
  const [open, setOpen] = useState(() => isChildActive ?? false);

  if (item.children) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen((p) => !p)}
          className={clsx(
            'nav-link w-full',
            isChildActive && open === false && 'nav-link-group-active',
            isRTL ? 'flex-row-reverse' : '',
          )}
        >
          <span className={clsx('material-icons-round text-xl flex-shrink-0', isChildActive ? 'text-brand' : 'text-white/55')}>
            {item.icon}
          </span>
          <span className={clsx('text-sm font-medium flex-1', isRTL ? 'text-right' : 'text-left')}>
            {t(`nav.${item.key}`)}
          </span>
          <span className={clsx('material-icons-round text-sm text-white/30 transition-transform duration-200', open && 'rotate-90')}>
            {isRTL ? 'chevron_left' : 'chevron_right'}
          </span>
        </button>

        <div
          className={clsx(
            'overflow-hidden transition-all duration-200',
            open ? 'max-h-96 mt-0.5' : 'max-h-0',
          )}
        >
          <div className={clsx('space-y-0.5 py-0.5', isRTL ? 'pr-3 mr-2 border-r border-white/10' : 'pl-3 ml-2 border-l border-white/10')}>
            {item.children.map((child) => (
              <NavItem key={child.key} item={child} isRTL={isRTL} depth={depth + 1} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <NavLink
      to={item.path}
      end={item.exact}
      onClick={() => { if (!isDesktop) close(); }}
      className={({ isActive }) =>
        clsx('nav-link', isActive && 'active', depth > 0 && 'py-2', isRTL && 'flex-row-reverse')
      }
    >
      {({ isActive }) => (
        <>
          <span className={clsx('material-icons-round flex-shrink-0', depth > 0 ? 'text-[17px]' : 'text-xl', isActive ? 'text-brand' : 'text-white/55')}>
            {item.icon}
          </span>
          <span className={clsx('font-medium flex-1', depth > 0 ? 'text-xs' : 'text-sm', isRTL && 'text-right')}>
            {t(`nav.${item.key}`)}
          </span>
        </>
      )}
    </NavLink>
  );
}

export default function Sidebar() {
  const { t } = useTranslation();
  const { isRTL } = useLang();
  const { open, close, isDesktop } = useSidebar();
  const { user, hasFeature } = useAuth();
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState('');
  const roleName = typeof user?.role === 'object' ? user?.role?.name : user?.role;
  const isSuperAdmin = roleName === 'SUPER_ADMIN' || user?.is_super_admin;
  const isAdminOrHr = ['ADMIN', 'HR', 'SUPER_ADMIN'].includes(roleName);

  const canShowItem = (item) => {
    if (item?.superAdminOnly && !isSuperAdmin) return false;
    if (item?.adminOnly && !['ADMIN', 'SUPER_ADMIN'].includes(roleName)) return false;
    if (item?.requireEmployee && !user?.employee_id) return false;
    if (isSuperAdmin || !item?.feature) return true;
    return hasFeature(item.feature);
  };

  const filterItemsByFeature = (items) => items
    .filter((item) => canShowItem(item))
    .map((item) => (
      item.children
        ? { ...item, children: item.children.filter((child) => canShowItem(child)) }
        : item
    ))
    .filter((item) => !item.children || item.children.length > 0);

  const navByKey = useMemo(() => Object.fromEntries(NAV.map((n) => [n.key, n])), []);

  const visibleMain = MAIN_NAV_KEYS
    .map((k) => navByKey[k])
    .filter(Boolean)
    .filter((item) => (
      (isAdminOrHr || ['dashboard', 'my_profile', 'attendance', 'leaves'].includes(item.key))
      && canShowItem(item)
    ));

  const devicesNav = filterItemsByFeature([navByKey.devices])[0];
  const managementNav = filterItemsByFeature([navByKey.management])[0];
  const settingsNav = navByKey.settings;
  const companiesNav = navByKey.companies;

  const showBiometric = isAdminOrHr && devicesNav;
  const showManagement = isAdminOrHr && managementNav;

  const hidden = !isDesktop && !open;

  const handleEnablePushMobile = useCallback(async () => {
    setPushBusy(true);
    setPushMsg('');
    try {
      await enableWebPushNow();
      setPushMsg(t('notifications.enabled', 'تم تفعيل التنبيهات على هذا الجهاز'));
    } catch (e) {
      setPushMsg(messageForWebPushError(t, e));
    } finally {
      setPushBusy(false);
    }
  }, [t]);

  return (
    <>
      {!isDesktop && open && (
        <div
          className="fixed inset-0 z-20 bg-black/50 backdrop-blur-sm"
          onClick={close}
          aria-hidden
        />
      )}

      <aside
        className={clsx(
          'sidebar-app-bg fixed top-0 bottom-0 z-30 flex flex-col transition-transform duration-300 ease-in-out',
          isRTL ? 'right-0' : 'left-0',
          hidden && (isRTL ? 'translate-x-full' : '-translate-x-full'),
        )}
        style={{ width: '260px' }}
      >
        <div className="px-5 pt-6 pb-4 border-b border-white/10 flex-shrink-0">
          <div className={clsx('flex items-center gap-3', isRTL && 'flex-row-reverse')}>
            <div className="sidebar-brand-icon flex size-10 flex-shrink-0 items-center justify-center rounded-xl">
              <span className="material-icons-round text-white" style={{ fontSize: 20 }}>fingerprint</span>
            </div>
            <div className={clsx('min-w-0 leading-tight', isRTL && 'text-right')}>
              <p className="text-white font-bold text-sm truncate">{t('app_name')}</p>
              <p className="text-white/35 text-[11px]">HR &amp; Biometric Suite</p>
            </div>
          </div>
        </div>

        {!isDesktop && (
          <div className="px-3 pb-3 flex-shrink-0">
            <button
              type="button"
              onClick={handleEnablePushMobile}
              disabled={pushBusy}
              className={clsx(
                'w-full rounded-xl border border-white/25 bg-white/15 px-3 py-3.5 text-white shadow-lg',
                'hover:bg-white/25 active:scale-[0.99] transition disabled:opacity-55 disabled:active:scale-100',
                'flex items-center gap-3',
                isRTL && 'flex-row-reverse text-right',
              )}
            >
              <span className="flex size-11 flex-shrink-0 items-center justify-center rounded-lg bg-brand/90 text-white">
                <span className={clsx('material-icons-round text-2xl', pushBusy && 'animate-spin')}>
                  {pushBusy ? 'sync' : 'notifications_active'}
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold leading-snug">
                  {t('notifications.enable_on_device_title', 'تفعيل تنبيهات الجوال')}
                </span>
                <span className="mt-0.5 block text-[11px] font-normal text-white/70 leading-snug">
                  {t('notifications.enable_on_device_hint', 'البصمة الاضطرارية والبصمة المفاجئة — حتى مع إغلاق التبويب')}
                </span>
              </span>
            </button>
            {pushMsg && (
              <p className={clsx('mt-2 rounded-lg bg-black/25 px-2.5 py-2 text-[11px] leading-relaxed text-white/85', isRTL && 'text-right')}>
                {pushMsg}
              </p>
            )}
          </div>
        )}

        <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-0.5" style={{ scrollbarWidth: 'thin' }}>
          <SectionLabel label={t('nav_group.main')} />
          {visibleMain.map((item) => <NavItem key={item.key} item={item} isRTL={isRTL} />)}

          {showBiometric && (
            <>
              <SectionLabel label={t('nav_group.biometric')} />
              <NavItem item={devicesNav} isRTL={isRTL} />
            </>
          )}

          {isAdminOrHr && (
            <>
              <SectionLabel label={t('nav_group.system')} />
              {showManagement && <NavItem item={managementNav} isRTL={isRTL} />}
              {canShowItem(settingsNav) && <NavItem item={settingsNav} isRTL={isRTL} />}
              {canShowItem(companiesNav) && <NavItem item={companiesNav} isRTL={isRTL} />}
            </>
          )}
        </nav>

        <div className="px-4 py-3 border-t border-white/10 flex-shrink-0">
          <div className={clsx('flex items-center gap-2', isRTL && 'flex-row-reverse')}>
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
            <p className="text-white/30 text-[11px]">{t('system_online')}</p>
            <span className="flex-1" />
            <button
              type="button"
              onClick={close}
              className="lg:hidden w-7 h-7 rounded-full flex items-center justify-center
                         text-white/40 hover:text-white hover:bg-white/10 transition"
              aria-label="Close menu"
            >
              <span className="material-icons-round text-lg">close</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
