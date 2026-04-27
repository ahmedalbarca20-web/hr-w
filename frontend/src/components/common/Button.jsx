import clsx from 'clsx';

export default function Button({
  children, variant = 'primary', size = 'md',
  className, disabled, loading, icon, type = 'button', onClick,
}) {
  const base = {
    primary: 'btn-primary',
    ghost:   'btn-ghost',
    danger:  'btn-danger',
  }[variant] || 'btn-ghost';

  const sizes = { sm: 'px-3 py-1.5 text-xs', md: '', lg: 'px-6 py-3 text-base' };

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={clsx(base, sizes[size], disabled && 'opacity-50 cursor-not-allowed', className)}
    >
      {loading && (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {icon && !loading && <span className="material-icons-round text-base">{icon}</span>}
      {children}
    </button>
  );
}

