import { forwardRef } from 'react';
import clsx from 'clsx';
import { toErrorString } from '../../utils/helpers';

const Input = forwardRef(function Input(
  { label, error, className, id, ...props }, ref
) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '_');
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="label">{label}</label>
      )}
      <input
        id={inputId}
        ref={ref}
        className={clsx(
          'input',
          error && 'border-danger focus:ring-danger/40',
          className,
        )}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-danger">{toErrorString(error, '')}</p>}
    </div>
  );
});

export default Input;

