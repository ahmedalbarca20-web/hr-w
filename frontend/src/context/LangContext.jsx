import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import i18n from '../i18n';

const LangContext = createContext(null);

export function LangProvider({ children }) {
  const [lang, setLang] = useState(
    localStorage.getItem('lang') || import.meta.env.VITE_DEFAULT_LANG || 'ar'
  );

  const toggleLang = useCallback(() => {
    const next = lang === 'ar' ? 'en' : 'ar';
    applyLang(next);
  }, [lang]);

  const applyLang = (l) => {
    setLang(l);
    i18n.changeLanguage(l);
    localStorage.setItem('lang', l);
    document.documentElement.lang = l;
    document.documentElement.dir  = l === 'ar' ? 'rtl' : 'ltr';
  };

  // Apply on mount
  useEffect(() => { applyLang(lang); }, []); // eslint-disable-line

  return (
    <LangContext.Provider value={{ lang, toggleLang, isRTL: lang === 'ar' }}>
      {children}
    </LangContext.Provider>
  );
}

export const useLang = () => useContext(LangContext);
export default LangContext;

