import clsx from 'clsx';

const STYLES = {
  success: 'bg-success/10 border-success text-green-800',
  danger:  'bg-danger/10  border-danger  text-red-800',
  warning: 'bg-warning/10 border-warning text-orange-800',
  info:    'bg-info/10    border-info    text-cyan-800',
};

const ICONS = {
  success: 'check_circle',
  danger:  'error',
  warning: 'warning',
  info:    'info',
};

export default function Alert({ type = 'info', message, onClose }) {
  if (!message) return null;
  return (
    <div className={clsx('flex items-start gap-3 border rounded-lg px-4 py-3 text-sm', STYLES[type])}>
      <span className="material-icons-round text-xl flex-shrink-0">{ICONS[type]}</span>
      <span className="flex-1">{message}</span>
      {onClose && (
        <button onClick={onClose} className="material-icons-round text-xl opacity-60 hover:opacity-100">
          close
        </button>
      )}
    </div>
  );
}

