import { createContext, useContext, useState, useEffect } from 'react';
import { getCompanySettings, updateCompanySettings } from '../api/settings.api';

/**
 * Supported currencies.
 * symbol  – used as prefix in amounts
 * locale  – for toLocaleString formatting
 */
export const CURRENCIES = {
  USD: { code: 'USD', symbol: '$',   name: 'US Dollar',      nameAr: 'دولار أمريكي' },
  IQD: { code: 'IQD', symbol: 'IQD', name: 'Iraqi Dinar',    nameAr: 'دينار عراقي'  },
  SAR: { code: 'SAR', symbol: 'SAR', name: 'Saudi Riyal',    nameAr: 'ريال سعودي'   },
};

const LS_KEY = 'hr_currency';

const CurrencyCtx = createContext({
  currency: CURRENCIES.IQD,
  setCurrencyCode: () => {},
  fmt: (n) => String(n),
});

export function CurrencyProvider({ children }) {
  const [code, setCode] = useState(
    () => localStorage.getItem(LS_KEY) || 'IQD'
  );

  // Fetch from server on mount (so it stays in sync if another browser changed it)
  useEffect(() => {
    // Skip if not authenticated
    if (!localStorage.getItem('access_token')) return;
    getCompanySettings()
      .then(({ data }) => {
        const serverCode = data?.data?.currency;
        if (serverCode && CURRENCIES[serverCode]) {
          setCode(serverCode);
          localStorage.setItem(LS_KEY, serverCode);
        }
      })
      .catch(() => { /* use localStorage fallback silently */ });
  }, []);

  const setCurrencyCode = async (newCode) => {
    if (!CURRENCIES[newCode]) return;
    setCode(newCode);
    localStorage.setItem(LS_KEY, newCode);
    try {
      await updateCompanySettings({ currency: newCode });
    } catch {
      // non-critical: value is already saved locally
    }
  };

  const currency = CURRENCIES[code] || CURRENCIES.IQD;

  /** Format a monetary amount using the active currency symbol */
  const fmt = (amount) => {
    if (amount == null || amount === '') return '—';
    const num = Number(amount);
    if (isNaN(num)) return String(amount);
    const formatted = num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    return `${currency.symbol} ${formatted}`;
  };

  return (
    <CurrencyCtx.Provider value={{ currency, setCurrencyCode, fmt }}>
      {children}
    </CurrencyCtx.Provider>
  );
}

export const useCurrency = () => useContext(CurrencyCtx);
