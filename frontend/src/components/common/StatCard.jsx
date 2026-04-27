import clsx from 'clsx';

const GRADIENTS = {
  brand:   'linear-gradient(195deg, #ab47bc, #7b1fa2)',
  info:    'linear-gradient(195deg, #26c6da, #0097a7)',
  success: 'linear-gradient(195deg, #66bb6a, #388e3c)',
  warning: 'linear-gradient(195deg, #ffa726, #f57c00)',
  danger:  'linear-gradient(195deg, #ef5350, #c62828)',
};

const SHADOWS = {
  brand:   '0 4px 20px 0 rgba(0,0,0,.14), 0 7px 10px -5px rgba(156,39,176,.4)',
  info:    '0 4px 20px 0 rgba(0,0,0,.14), 0 7px 10px -5px rgba(0,188,212,.4)',
  success: '0 4px 20px 0 rgba(0,0,0,.14), 0 7px 10px -5px rgba(76,175,80,.4)',
  warning: '0 4px 20px 0 rgba(0,0,0,.14), 0 7px 10px -5px rgba(255,152,0,.4)',
  danger:  '0 4px 20px 0 rgba(0,0,0,.14), 0 7px 10px -5px rgba(244,67,54,.4)',
};

/**
 * Material-Dashboard style stat card.
 *
 * Props:
 *  icon    – Material icon name (string)
 *  color   – 'brand' | 'info' | 'success' | 'warning' | 'danger'
 *  label   – sub-label text
 *  value   – big number / text
 *  footer  – optional small footer text
 */
export default function StatCard({ icon, color = 'brand', label, value, footer }) {
  const gradient = GRADIENTS[color] || GRADIENTS.brand;
  const shadow   = SHADOWS[color]   || SHADOWS.brand;

  return (
    <div className="md-card pt-2 pb-4 px-4" style={{ overflow: 'visible' }}>
      {/* Floating icon box */}
      <div
        className="flex items-center justify-center rounded-xl"
        style={{
          width: 64, height: 64,
          background: gradient,
          boxShadow: shadow,
          marginTop: '-1.5rem',
          marginInlineStart: '1rem',
        }}
      >
        <span className="material-icons-round text-white text-3xl">{icon}</span>
      </div>

      {/* Content */}
      <div className="text-end mt-1 pe-2">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
        <h3 className="text-2xl font-bold text-gray-800 leading-tight">{value}</h3>
      </div>

      {footer && (
        <>
          <hr className="border-gray-100 my-3" />
          <p className="text-xs text-gray-400 px-2">{footer}</p>
        </>
      )}
    </div>
  );
}
