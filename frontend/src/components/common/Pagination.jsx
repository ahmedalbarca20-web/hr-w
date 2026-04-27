import { useTranslation } from 'react-i18next';
import clsx from 'clsx';

export default function Pagination({ page, totalPages, onPage }) {
  const { t } = useTranslation();
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-600">
      <span>
        {t('common.page')} {page} {t('common.of')} {totalPages}
      </span>
      <div className="flex gap-2">
        <button
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className={clsx(
            'btn-ghost py-1 px-3 text-sm',
            page <= 1 && 'opacity-40 cursor-not-allowed',
          )}
        >
          {t('common.prev')}
        </button>
        <button
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          className={clsx(
            'btn-ghost py-1 px-3 text-sm',
            page >= totalPages && 'opacity-40 cursor-not-allowed',
          )}
        >
          {t('common.next')}
        </button>
      </div>
    </div>
  );
}

