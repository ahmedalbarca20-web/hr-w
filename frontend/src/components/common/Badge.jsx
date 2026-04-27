import clsx from 'clsx';

const VARIANTS = {
  success:  'bg-success/15 text-green-700',
  danger:   'bg-danger/15 text-red-700',
  warning:  'bg-warning/15 text-orange-700',
  info:     'bg-info/15 text-cyan-700',
  default:  'bg-gray-100 text-gray-600',
  brand:    'bg-brand/15 text-purple-700',
};

const STATUS_MAP = {
  ACTIVE:       'success',
  PRESENT:      'success',
  APPROVED:     'success',
  PAID:         'success',
  INACTIVE:     'default',
  ABSENT:       'danger',
  REJECTED:     'danger',
  LATE:         'warning',
  HALF_DAY:     'warning',
  ON_LEAVE:     'info',
  LEAVE:        'info',
  PENDING:      'warning',
  DRAFT:        'default',
  PROCESSING:   'info',
  PROCESSED:    'brand',
  TERMINATED:   'danger',
};

export default function Badge({ label, variant, status }) {
  const v = variant || STATUS_MAP[status?.toUpperCase()] || 'default';
  return (
    <span className={clsx('badge', VARIANTS[v] || VARIANTS.default)}>
      {label || status}
    </span>
  );
}

