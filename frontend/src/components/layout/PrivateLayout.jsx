import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header  from './Header';
import Footer  from './Footer';
import { SidebarProvider, useSidebar } from '../../context/SidebarContext';
import { useAuth } from '../../context/AuthContext';

const PAGE_TITLES = {
  '/':                'nav.dashboard',
  '/employees':       'nav.employees',
  '/departments':     'nav.departments',
  '/attendance':      'nav.attendance',
  '/leaves':          'nav.leaves',
  '/payroll':         'nav.payroll',
  '/devices':         'nav.devices',
  '/devices/list':    'nav.devices_list',
  '/devices/add':     'nav.devices_add',
  '/devices/logs':    'nav.devices_logs',
  '/devices/sync':    'nav.devices_sync',
  '/settings':        'nav.settings',
  '/companies':       'nav.companies',
  '/announcements':   'announcement.title',
  '/users':           'users.title',
  '/shifts':          'shift.title',
  '/process':         'process.title',
  '/attendance/report': 'nav.attendance',
  '/leaves/approval': 'nav.leaves',
  '/employees/profile': 'nav.my_profile',
};

export default function PrivateLayout({ children }) {
  return (
    <SidebarProvider>
      <PrivateLayoutInner>{children}</PrivateLayoutInner>
    </SidebarProvider>
  );
}

function PrivateLayoutInner({ children }) {
  const { t }     = useTranslation();
  const location  = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isDesktop } = useSidebar();

  useEffect(() => {
    const onSwMessage = (event) => {
      const d = event.data;
      if (!d || d.type !== 'HR_PUSH_NAVIGATE' || typeof d.url !== 'string') return;
      try {
        const u = new URL(d.url, window.location.origin);
        if (u.origin !== window.location.origin) return;
        navigate(`${u.pathname}${u.search}${u.hash}`);
      } catch {
        /* ignore */
      }
    };
    const sw = navigator.serviceWorker;
    if (!sw) return undefined;
    sw.addEventListener('message', onSwMessage);
    return () => sw.removeEventListener('message', onSwMessage);
  }, [navigate]);

  let titleKey = 'app_name';
  const titleEntries = Object.entries(PAGE_TITLES);
  for (let i = titleEntries.length - 1; i >= 0; i -= 1) {
    const [path] = titleEntries[i];
    if (location.pathname === path || location.pathname.startsWith(`${path}/`)) {
      titleKey = titleEntries[i][1];
      break;
    }
  }

  // On desktop the sidebar is always visible → push content by 260px.
  // On mobile the sidebar is an overlay → no push.
  const marginStart = isDesktop ? '260px' : '0px';

  return (
    <div className="min-h-screen bg-gray-100">
      <Sidebar />

      {/* Main content area */}
      <div
        className="flex flex-col min-h-screen"
        style={{
          marginInlineStart: marginStart,
          transition: 'margin-inline-start 0.3s ease',
        }}
      >
        <Header title={t(titleKey)} />

        {/* Page body */}
        <main className="flex-1 px-2 sm:px-4 lg:px-6 pt-24 sm:pt-24 pb-8">
          <div className="mx-auto w-full max-w-[1500px]">
            {children}
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}

