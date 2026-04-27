// Misc utility functions

/**
 * Normalize API / thrown values for UI text (avoids React #31 when rendering errors).
 * Handles string, `{ code, message }`, axios `data.error` objects, etc.
 */
export function toErrorString(value, fallback = 'Something went wrong') {
  if (value == null || value === '') return fallback;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    if (typeof value.message === 'string' && value.message.trim()) return value.message.trim();
    if (typeof value.error === 'string' && value.error.trim()) return value.error.trim();
    if (Array.isArray(value.errors)) {
      return value.errors
        .map((e) => (typeof e === 'string' ? e : e?.message || String(e)))
        .filter(Boolean)
        .join(', ');
    }
    const c = value.code;
    const m = value.message;
    if (c && typeof m === 'string' && m.trim()) return `${c}: ${m.trim()}`;
    if (typeof m === 'string' && m.trim()) return m.trim();
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return fallback;
}
