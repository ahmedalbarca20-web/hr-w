import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLang } from '../../context/LangContext';
import { useSidebar } from '../../context/SidebarContext';
import clsx from 'clsx';

export default function Header({ title }) {
  const { t }             = useTranslation();
  const { user, logout }  = useAuth();
  const { lang, toggleLang, isRTL } = useLang();
  const { toggle: toggleSidebar, isDesktop } = useSidebar();
  const navigate          = useNavigate();
  const [open, setOpen]   = useState(false);
  const ref               = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Responsive header positioning
  const sidebarOffset = '284px'; // 260 sidebar + 24 gap
  const left  = isDesktop ? (isRTL ? '24px' : sidebarOffset) : '12px';
  const right = isDesktop ? (isRTL ? sidebarOffset : '24px') : '12px';

  return (
    <header
      className="fixed top-2 sm:top-4 z-20 bg-white/90 backdrop-blur rounded-xl shadow-card
                 flex items-center justify-between px-4 md:px-6"
      style={{ left, right, height: '66px', transition: 'left 0.3s ease, right 0.3s ease' }}
    >
      {/* Hamburger — mobile only */}
      <div className={clsx('flex items-center gap-3', isRTL && 'flex-row-reverse')}>
        <button
          onClick={toggleSidebar}
          className="lg:hidden w-9 h-9 rounded-lg flex items-center justify-center
                     text-gray-500 hover:bg-gray-100 transition -ms-1"
          aria-label="Toggle menu"
        >
          <span className="material-icons-round">menu</span>
        </button>

        {/* Page title / breadcrumb */}
        <div>
          <p className="text-xs text-gray-400 capitalize hidden sm:block">
            {t('app_name')}
          </p>
          <h1 className="text-gray-800 font-semibold text-base leading-tight">{title}</h1>
        </div>
      </div>

      {/* Actions */}
      <div className={clsx('flex items-center gap-3', isRTL && 'flex-row-reverse')}>
        {/* Lang toggle */}
        <button
          onClick={toggleLang}
          className="w-9 h-9 rounded-full border border-gray-200 flex items-center
                     justify-center text-gray-500 hover:bg-gray-100 transition text-xs font-bold"
          title="Toggle language"
        >
          {lang === 'ar' ? 'EN' : 'ع'}
        </button>

        {/* Notifications */}
        <button
          className="w-9 h-9 rounded-full border border-gray-200 flex items-center
                     justify-center text-gray-500 hover:bg-gray-100 transition relative"
        >
          <span className="material-icons-round text-xl">notifications_none</span>
          <span
            className="absolute top-1 end-1 w-2 h-2 rounded-full"
            style={{ background: '#f44336' }}
          />
        </button>

        {/* User avatar + dropdown */}
        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen(p => !p)}
            className={clsx(
              'flex items-center gap-2 hover:opacity-80 transition',
              isRTL && 'flex-row-reverse',
            )}
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center
                         text-white font-semibold text-sm shadow-icon"
              style={{ background: 'linear-gradient(195deg, #ec407a, #d81b60)' }}
            >
              {(user?.name?.[0] || 'U').toUpperCase()}
            </div>
            <span className="text-sm font-medium text-gray-700 hidden md:block">
              {user?.name || 'User'}
            </span>
            <span className="material-icons-round text-gray-400 text-base">expand_more</span>
          </button>

          {open && (
            <div
              className={clsx(
                'absolute top-full mt-2 w-44 bg-white shadow-card-lg rounded-xl overflow-hidden border border-gray-100 z-50',
                isRTL ? 'left-0' : 'right-0',
              )}
            >
              <button
                onClick={handleLogout}
                className={clsx(
                  'w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition',
                  isRTL && 'flex-row-reverse',
                )}
              >
                <span className="material-icons-round text-base text-gray-400">logout</span>
                {t('auth.logout')}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

