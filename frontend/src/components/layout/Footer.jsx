import { useTranslation } from 'react-i18next';

export default function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="mt-6 px-6 py-4 flex flex-col sm:flex-row items-center
                       justify-between gap-2 text-xs text-gray-400">
      <span>© 2026 HR System — {t('app_name')}</span>
      <span>Powered by React + Tailwind</span>
    </footer>
  );
}

