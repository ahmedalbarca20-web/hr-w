import { useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useLang } from '../../context/LangContext';
import { useAuth } from '../../context/AuthContext';
import { useCurrency, CURRENCIES } from '../../context/CurrencyContext';
import { getCompanySettings, updateCompanySettings } from '../../api/settings.api';
import { listCompanies } from '../../api/company.api';
import Button from '../../components/common/Button';
import Alert from '../../components/common/Alert';
import {
  DEFAULT_COMPANY_TIMEZONE,
  COMPANY_TIMEZONE_OPTIONS,
} from '../../lib/regionDefaults';
import {
  HR_ACTIVE_COMPANY_KEY,
  HR_ACTIVE_TENANT_EVENT,
  getActiveTenantCompanyId,
  isSuperAdminUser,
} from '../../utils/tenantScope';

export default function Settings() {
  const { t }               = useTranslation();
  const { lang, toggleLang, isRTL } = useLang();
  const { user }            = useAuth();
  const { currency, setCurrencyCode } = useCurrency();
  const [saved, setSaved]   = useState(false);
  const [saving, setSaving] = useState(false);
  const [localCurrency, setLocalCurrency] = useState(currency.code);
  const [localTimezone, setLocalTimezone] = useState(DEFAULT_COMPANY_TIMEZONE);
  const [companyCode, setCompanyCode] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [tenantPick, setTenantPick] = useState(() => getActiveTenantCompanyId(user));
  const [companyRows, setCompanyRows] = useState([]);
  const isSa = isSuperAdminUser(user);

  const loadCompanyForm = useCallback(() => {
    const tid = getActiveTenantCompanyId(user);
    setTenantPick(tid);
    if (isSa && !tid) {
      setCompanyCode('');
      setCompanyName('');
      setLocalTimezone(DEFAULT_COMPANY_TIMEZONE);
      return;
    }
    getCompanySettings()
      .then(({ data }) => {
        const d = data?.data;
        setCompanyCode(d?.company_code || '');
        setCompanyName(d?.name || '');
        const tz = d?.timezone && String(d.timezone).trim();
        setLocalTimezone(tz || DEFAULT_COMPANY_TIMEZONE);
        const cur = d?.currency;
        if (cur && CURRENCIES[cur]) setLocalCurrency(cur);
      })
      .catch(() => {
        setCompanyCode('');
        setCompanyName('');
        setLocalTimezone(DEFAULT_COMPANY_TIMEZONE);
      });
  }, [user, isSa]);

  useEffect(() => {
    loadCompanyForm();
  }, [loadCompanyForm]);

  useEffect(() => {
    if (!isSa) return undefined;
    const onTenant = () => { loadCompanyForm(); };
    window.addEventListener(HR_ACTIVE_TENANT_EVENT, onTenant);
    return () => window.removeEventListener(HR_ACTIVE_TENANT_EVENT, onTenant);
  }, [isSa, loadCompanyForm]);

  useEffect(() => {
    if (!isSa) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await listCompanies({ limit: 500 });
        const rows = Array.isArray(data?.data) ? data.data : [];
        if (!cancelled) setCompanyRows(rows);
      } catch {
        if (!cancelled) setCompanyRows([]);
      }
    })();
    return () => { cancelled = true; };
  }, [isSa]);

  const handleSave = async () => {
    if (isSa && !getActiveTenantCompanyId(user)) return;
    setSaving(true);
    try {
      await updateCompanySettings({ currency: localCurrency, timezone: localTimezone });
      await setCurrencyCode(localCurrency);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const onPickTenant = (e) => {
    const v = Number(e.target.value);
    if (!Number.isInteger(v) || v < 1) return;
    localStorage.setItem(HR_ACTIVE_COMPANY_KEY, String(v));
    window.dispatchEvent(new Event(HR_ACTIVE_TENANT_EVENT));
  };

  const CURRENCY_OPTIONS = [
    { code: 'IQD', label: CURRENCIES.IQD.nameAr + ' — ' + CURRENCIES.IQD.name, symbol: 'IQD' },
    { code: 'USD', label: CURRENCIES.USD.nameAr + ' — ' + CURRENCIES.USD.name, symbol: '$' },
  ];

  const timezoneSelectOptions = useMemo(() => {
    const v = String(localTimezone || '').trim();
    if (v && !COMPANY_TIMEZONE_OPTIONS.some((o) => o.value === v)) {
      return [...COMPANY_TIMEZONE_OPTIONS, { value: v, label: v }];
    }
    return COMPANY_TIMEZONE_OPTIONS;
  }, [localTimezone]);

  return (
    <div className="space-y-6 max-w-2xl mx-auto w-full">
      {saved && (
        <Alert type="success" message={t('settings.saved')} onClose={() => setSaved(false)} />
      )}

      {isSa && (
        <div className="md-card p-4 border border-amber-200 bg-amber-50/80">
          <h3 className="text-sm font-semibold text-amber-950 mb-2">
            {t('settings.super_admin_tenant')}
          </h3>
          <p className="text-xs text-amber-900/90 mb-3 leading-relaxed">
            {t('settings.super_admin_tenant_hint')}
          </p>
          <label className="label text-xs text-gray-700">{t('settings.company_pick')}</label>
          <select
            className="input max-w-md mt-1"
            value={tenantPick && companyRows.some((c) => c.id === tenantPick) ? String(tenantPick) : ''}
            onChange={onPickTenant}
          >
            <option value="">{t('settings.company_pick_placeholder')}</option>
            {companyRows.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {(c.name_ar || c.name || '').trim() || `Company #${c.id}`}
              </option>
            ))}
          </select>
          {!tenantPick && (
            <p className="text-xs text-red-700 mt-2">{t('settings.pick_company_to_continue')}</p>
          )}
        </div>
      )}

      {/* Language card */}
      <div className="md-card" style={{ overflow: 'visible' }}>
        <div
          className="rounded-xl mx-4 -mt-4 p-4 shadow-card-lg mb-6"
          style={{ background: 'linear-gradient(195deg, #42424a, #191919)' }}
        >
          <h2 className="text-white font-semibold">{t('settings.title')}</h2>
        </div>

        <div className="px-6 pb-6 space-y-6">
          {/* Language selector */}
          <div>
            <label className="label text-sm font-semibold text-gray-700 mb-3 block">
              {t('settings.language')}
            </label>
            <div className="flex gap-3">
              {['ar', 'en'].map((l) => (
                <button
                  key={l}
                  onClick={() => lang !== l && toggleLang()}
                  className={`px-6 py-2.5 rounded-lg border text-sm font-medium transition ${
                    lang === l
                      ? 'border-brand bg-brand/10 text-brand'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {l === 'ar' ? t('settings.arabic') : t('settings.english')}
                </button>
              ))}
            </div>
          </div>

          {/* Currency selector */}
          <div className="border-t border-gray-100 pt-5">
            <label className="label text-sm font-semibold text-gray-700 mb-3 block">
              {t('settings.currency')}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {CURRENCY_OPTIONS.map((opt) => (
                <button
                  key={opt.code}
                  onClick={() => setLocalCurrency(opt.code)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-sm font-medium transition ${
                    localCurrency === opt.code
                      ? 'border-brand bg-brand/5 text-brand'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span
                    className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      localCurrency === opt.code ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {opt.symbol}
                  </span>
                  <span className="text-start leading-tight">{opt.label}</span>
                  {localCurrency === opt.code && (
                    <span className="material-icons-round text-brand text-lg ms-auto">check_circle</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Company time zone (Iraq default) */}
          <div className="border-t border-gray-100 pt-5">
            <label className="label text-sm font-semibold text-gray-700 mb-2 block">
              {t('settings.timezone')}
            </label>
            <select
              className="input max-w-md"
              value={localTimezone}
              onChange={(e) => setLocalTimezone(e.target.value)}
              dir="ltr"
            >
              {timezoneSelectOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1.5">
              {t('settings.timezone_hint')}
            </p>
          </div>

          {/* Profile info */}
          <div className="border-t border-gray-100 pt-5">
            <label className="label text-sm font-semibold text-gray-700 mb-3 block">
              {t('settings.profile')}
            </label>
            <div className="grid grid-cols-2 gap-4">
              {companyName && (
                <div className="col-span-2">
                  <label className="label">{t('settings.company_name')}</label>
                  <input readOnly value={companyName} className="input bg-gray-50 cursor-not-allowed" />
                </div>
              )}
              <div className="col-span-2">
                <label className="label">{t('auth.company_code', 'رمز الشركة')}</label>
                <input
                  readOnly
                  value={companyCode || '—'}
                  dir="ltr"
                  style={{ unicodeBidi: 'plaintext' }}
                  className="input bg-gray-50 cursor-not-allowed text-left font-mono"
                />
              </div>
              <div>
                <label className="label">{t('employee.name')}</label>
                <input
                  readOnly
                  defaultValue={user?.name || ''}
                  className="input bg-gray-50 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="label">{t('auth.email')}</label>
                <input
                  readOnly
                  defaultValue={user?.email || ''}
                  className="input bg-gray-50 cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button loading={saving} onClick={handleSave} disabled={isSa && !tenantPick}>
              {t('settings.save')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}


