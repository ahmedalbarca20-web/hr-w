import { useTranslation } from 'react-i18next';
import clsx from 'clsx';

export default function SearchBar({ value, onChange, placeholder, className }) {
  const { t }   = useTranslation();
  return (
    <div className={clsx('relative', className)}>
      <span
        className="material-icons-round absolute start-3 top-1/2 -translate-y-1/2
                   text-gray-400 text-xl pointer-events-none"
      >
        search
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || t('common.search')}
        className="input ps-10 py-2"
      />
    </div>
  );
}

