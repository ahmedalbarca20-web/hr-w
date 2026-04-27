import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import * as companyApi from '../../api/company.api';
import {
  DEFAULT_COMPANY_CURRENCY,
  DEFAULT_COMPANY_TIMEZONE,
  COMPANY_TIMEZONE_OPTIONS,
  COMPANY_CURRENCY_OPTIONS,
} from '../../lib/regionDefaults';
import { toErrorString } from '../../utils/helpers';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace('/api', '');

/* ── helpers ───────────────────────────────────────────────────────────────── */
const BLANK = {
  name: '', name_ar: '', currency: DEFAULT_COMPANY_CURRENCY, timezone: DEFAULT_COMPANY_TIMEZONE,
  phone: '', email: '', address: '', contract_start: '', contract_end: '', company_code: '',
};
const FEATURE_LABELS = {
  employees: 'الموظفين',
  departments: 'الأقسام',
  attendance: 'الحضور',
  leaves: 'الإجازات',
  payroll: 'الرواتب',
  reports: 'التقارير',
  devices: 'الأجهزة والبصمة',
  users: 'المستخدمين',
  announcements: 'الإعلانات',
  shifts: 'الجداول',
  process: 'المعالجة',
  zk_device_pin: 'عرض رمز جهاز البصمة (PIN)',
};

const FEATURE_DEFAULT_OFF_FOR_NEW_COMPANY = new Set(['zk_device_pin']);

function daysLeft(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24));
}

function ContractBadge({ contract_end }) {
  const days = daysLeft(contract_end);
  if (days === null) return <span className="text-gray-300 text-xs">—</span>;
  if (days < 0)   return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />منتهي</span>;
  if (days <= 30) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />{days} يوم</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />{days} يوم</span>;
}

function StatusBadge({ active }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
      active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-green-500' : 'bg-gray-400'}`} />
      {active ? 'نشط' : 'موقوف'}
    </span>
  );
}

/* ── modal ───────────────────────────────────────────────────────────────────── */
function CompanyModal({ company, onClose, onSaved }) {
  const [form, setForm]       = useState(company ? {
    ...company,
    contract_start: company.contract_start || '',
    contract_end: company.contract_end || '',
    company_code: company.tax_id || '',
    currency: String(company.currency || DEFAULT_COMPANY_CURRENCY).toUpperCase(),
    timezone: String(company.timezone || DEFAULT_COMPANY_TIMEZONE).trim(),
  } : { ...BLANK });

  const timezoneSelectOptions = useMemo(() => {
    const v = String(form.timezone || '').trim();
    if (v && !COMPANY_TIMEZONE_OPTIONS.some((o) => o.value === v)) {
      return [...COMPANY_TIMEZONE_OPTIONS, { value: v, label: v }];
    }
    return COMPANY_TIMEZONE_OPTIONS;
  }, [form.timezone]);

  const currencySelectOptions = useMemo(() => {
    const v = String(form.currency || '').trim().toUpperCase();
    if (v && !COMPANY_CURRENCY_OPTIONS.some((o) => o.value === v)) {
      return [...COMPANY_CURRENCY_OPTIONS, { value: v, label: v }];
    }
    return COMPANY_CURRENCY_OPTIONS;
  }, [form.currency]);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [featureOptions, setFeatureOptions] = useState([]);
  const [selectedFeatures, setSelectedFeatures] = useState([]);
  const [docFile, setDocFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const toggleFeature = (featureKey) => {
    setSelectedFeatures((prev) => (
      prev.includes(featureKey)
        ? prev.filter((f) => f !== featureKey)
        : [...prev, featureKey]
    ));
  };

  useEffect(() => {
    let mounted = true;
    const loadFeatures = async () => {
      if (!company?.id) {
        const all = Object.keys(FEATURE_LABELS);
        if (mounted) {
          setFeatureOptions(all);
          setSelectedFeatures(all.filter((f) => !FEATURE_DEFAULT_OFF_FOR_NEW_COMPANY.has(f)));
        }
        return;
      }
      try {
        const { data } = await companyApi.getCompanyFeatures(company.id);
        if (!mounted) return;
        const available = data?.data?.available || Object.keys(FEATURE_LABELS);
        const enabled = data?.data?.enabled || available;
        setFeatureOptions(available);
        setSelectedFeatures(enabled);
      } catch {
        if (mounted) {
          const all = Object.keys(FEATURE_LABELS);
          setFeatureOptions(all);
          setSelectedFeatures(all.filter((f) => !FEATURE_DEFAULT_OFF_FOR_NEW_COMPANY.has(f)));
        }
      }
    };

    loadFeatures();
    return () => { mounted = false; };
  }, [company?.id]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      let saved;
      const payload = { ...form, enabled_features: selectedFeatures };
      if (!String(payload.company_code || '').trim()) {
        delete payload.company_code;
      } else {
        payload.company_code = String(payload.company_code).trim().toUpperCase();
      }
      if (company) {
        const { data } = await companyApi.updateCompany(company.id, payload);
        saved = data.data;
      } else {
        const { data } = await companyApi.createCompany(payload);
        saved = data.data;
      }
      if (docFile && saved?.id) {
        setUploading(true);
        await companyApi.uploadContractDoc(saved.id, docFile);
      }
      onSaved();
    } catch (err) {
      setError(toErrorString(err.response?.data?.error ?? err.response?.data?.message, 'حدث خطأ أثناء الحفظ'));
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-purple-800 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <h2 className="text-white font-bold text-lg flex items-center gap-2">
            <span className="material-icons-round">domain</span>
            {company ? 'تعديل الشركة' : 'إضافة شركة جديدة'}
          </h2>
          <button onClick={onClose} className="text-white/70 hover:text-white">
            <span className="material-icons-round">close</span>
          </button>
        </div>

        <form onSubmit={submit} className="overflow-y-auto p-6 space-y-5">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              {toErrorString(error, '')}
            </p>
          )}

          {/* Basic info */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">معلومات الشركة</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">الاسم (إنجليزي) *</label>
                <input className="input" value={form.name} onChange={set('name')} required />
              </div>
              <div>
                <label className="label">الاسم (عربي)</label>
                <input className="input" value={form.name_ar} onChange={set('name_ar')} dir="rtl" />
              </div>
              <div>
                <label className="label">العملة</label>
                <select className="input" value={form.currency} onChange={set('currency')}>
                  {currencySelectOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">المنطقة الزمنية</label>
                <select className="input" value={form.timezone} onChange={set('timezone')} dir="ltr">
                  {timezoneSelectOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">الهاتف</label>
                <input className="input" value={form.phone} onChange={set('phone')} />
              </div>
              <div>
                <label className="label">رمز الشركة (اختياري)</label>
                <input
                  className="input text-left"
                  dir="ltr"
                  style={{ unicodeBidi: 'plaintext' }}
                  value={form.company_code || ''}
                  onChange={set('company_code')}
                  placeholder="COMP-1234"
                />
              </div>
              <div>
                <label className="label">بريد أدمن الشركة (تسجيل الدخول)</label>
                <input className="input" type="email" value={form.email} onChange={set('email')} />
              </div>
              <div>
                <label className="label">{company ? 'كلمة مرور جديدة (اختياري)' : 'كلمة مرور أدمن الشركة *'}</label>
                <input className="input" type="password" value={form.password || ''} onChange={set('password')} required={!company} />
              </div>
            </div>
            <div className="mt-3">
              <label className="label">العنوان</label>
              <textarea className="input resize-none" rows={2} value={form.address} onChange={set('address')} />
            </div>
          </div>

          {/* Contract period */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">مدة العقد / الاشتراك</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">تاريخ بداية العقد</label>
                <input className="input" type="date" value={form.contract_start} onChange={set('contract_start')} />
              </div>
              <div>
                <label className="label">تاريخ انتهاء العقد</label>
                <input className="input" type="date" value={form.contract_end} onChange={set('contract_end')} />
              </div>
            </div>
            {form.contract_end && (() => {
              const days = daysLeft(form.contract_end);
              if (days === null) return null;
              const color = days < 0 ? 'text-red-600 bg-red-50' : days <= 30 ? 'text-amber-600 bg-amber-50' : 'text-green-600 bg-green-50';
              const msg   = days < 0 ? `انتهى العقد منذ ${Math.abs(days)} يوم` : `متبقي ${days} يوم على انتهاء العقد`;
              return <p className={`mt-2 text-xs px-3 py-1.5 rounded-lg font-medium ${color}`}>{msg}</p>;
            })()}
          </div>

          {/* Feature selector */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400">خصائص العقد</p>
              <p className="text-xs text-gray-400">{selectedFeatures.length} / {featureOptions.length}</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {featureOptions.map((featureKey) => {
                const active = selectedFeatures.includes(featureKey);
                return (
                  <button
                    key={featureKey}
                    type="button"
                    onClick={() => toggleFeature(featureKey)}
                    className={`px-3 py-2 rounded-lg border text-sm text-right transition ${
                      active
                        ? 'border-purple-300 bg-purple-50 text-purple-700'
                        : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    {FEATURE_LABELS[featureKey] || featureKey}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-gray-400">السوبر أدمن فقط يحدد الصفحات المسموحة لكل شركة حسب العقد.</p>
          </div>

          {/* Contract document */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">وثيقة العقد (للأرشفة)</p>
            {company?.contract_doc && (
              <div className="mb-3 flex items-center gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
                <span className="material-icons-round text-purple-500">description</span>
                <span className="text-sm text-gray-600 flex-1 truncate">{company.contract_doc.split('/').pop()}</span>
                <a href={`${API_BASE}/${company.contract_doc}`} target="_blank" rel="noreferrer"
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                  <span className="material-icons-round text-sm">open_in_new</span>عرض
                </a>
              </div>
            )}
            <div onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center cursor-pointer hover:border-purple-400 hover:bg-purple-50 transition-all">
              <span className="material-icons-round text-3xl text-gray-300 block mb-1">upload_file</span>
              <p className="text-sm text-gray-500">
                {docFile ? docFile.name : (company?.contract_doc ? 'استبدال الوثيقة' : 'اضغط لرفع وثيقة العقد')}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">PDF، JPG، PNG — الحد الأقصى 20 ميجابايت</p>
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden"
                onChange={(e) => setDocFile(e.target.files[0] || null)} />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="btn-ghost">إلغاء</button>
            <button type="submit" disabled={saving || uploading} className="btn-primary">
              {(saving || uploading)
                ? <><span className="material-icons-round animate-spin text-base">sync</span> جاري الحفظ…</>
                : <><span className="material-icons-round text-base">save</span> حفظ</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── main page ───────────────────────────────────────────────────────────────── */
export default function CompanyList() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [modal, setModal]         = useState(false);
  const [deleting, setDeleting]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await companyApi.listCompanies({ search, limit: 100 });
      setCompanies(data.data || []);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const handleSaved  = () => { setModal(false); load(); };
  const handleDelete = async (co) => {
    if (!window.confirm(`حذف "${co.name}"؟`)) return;
    setDeleting(co.id);
    try { await companyApi.deleteCompany(co.id); load(); }
    finally { setDeleting(null); }
  };
  const handleToggle = async (co) => {
    await companyApi.toggleStatus(co.id, co.is_active ? 0 : 1);
    load();
  };

  const totalActive  = companies.filter((c) => c.is_active).length;
  const expiringSoon = companies.filter((c) => { const d = daysLeft(c.contract_end); return d !== null && d >= 0 && d <= 30; }).length;
  const expired      = companies.filter((c) => { const d = daysLeft(c.contract_end); return d !== null && d < 0; }).length;

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'إجمالي الشركات',  value: companies.length, icon: 'business',     color: '#7b1fa2' },
          { label: 'الشركات النشطة',  value: totalActive,      icon: 'check_circle', color: '#388e3c' },
          { label: 'تنتهي قريباً',    value: expiringSoon,     icon: 'schedule',     color: '#f57c00' },
          { label: 'منتهية الصلاحية', value: expired,          icon: 'warning',      color: '#c62828' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl shadow-card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: s.color + '18' }}>
              <span className="material-icons-round text-xl" style={{ color: s.color }}>{s.icon}</span>
            </div>
            <div>
              <p className="text-xl font-bold text-gray-800">{s.value}</p>
              <p className="text-xs text-gray-400">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl shadow-card px-5 py-4 flex items-center gap-3">
        <div className="relative flex-1">
          <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">search</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="البحث في الشركات…" className="input pl-9" />
        </div>
        <button onClick={() => setModal(null)} className="btn-primary gap-2">
          <span className="material-icons-round text-base">add</span>
          إضافة شركة
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-card overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">الشركة</th>
              <th className="px-4 py-3">رمز الشركة</th>
              <th className="px-4 py-3">العملة</th>
              <th className="px-4 py-3">بداية العقد</th>
              <th className="px-4 py-3">نهاية العقد</th>
              <th className="px-4 py-3">المتبقي</th>
              <th className="px-4 py-3">وثيقة العقد</th>
              <th className="px-4 py-3">الحالة</th>
              <th className="px-4 py-3 text-right">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr><td colSpan={10} className="px-5 py-8 text-center text-gray-400">
                <span className="material-icons-round animate-spin text-2xl">sync</span>
              </td></tr>
            )}
            {!loading && companies.length === 0 && (
              <tr><td colSpan={10} className="px-5 py-10 text-center text-gray-400">لا توجد شركات</td></tr>
            )}
            {!loading && companies.map((co) => (
              <tr key={co.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-gray-400">{co.id}</td>
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-800">{co.name}</p>
                  {co.name_ar && <p className="text-xs text-gray-400" dir="rtl">{co.name_ar}</p>}
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded inline-block text-left" dir="ltr" style={{ unicodeBidi: 'plaintext' }}>
                    {co.tax_id || '—'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{co.currency}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{co.contract_start || '—'}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{co.contract_end || '—'}</td>
                <td className="px-4 py-3"><ContractBadge contract_end={co.contract_end} /></td>
                <td className="px-4 py-3">
                  {co.contract_doc ? (
                    <a href={`${API_BASE}/${co.contract_doc}`} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                      <span className="material-icons-round text-sm">description</span>عرض
                    </a>
                  ) : <span className="text-gray-300 text-xs">—</span>}
                </td>
                <td className="px-4 py-3"><StatusBadge active={co.is_active} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => handleToggle(co)} title={co.is_active ? 'إيقاف' : 'تفعيل'}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
                      <span className="material-icons-round text-base">{co.is_active ? 'toggle_on' : 'toggle_off'}</span>
                    </button>
                    <button onClick={() => setModal(co)} title="تعديل"
                      className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600">
                      <span className="material-icons-round text-base">edit</span>
                    </button>
                    <button onClick={() => handleDelete(co)} disabled={deleting === co.id} title="حذف"
                      className="p-1.5 rounded-lg hover:bg-red-50 text-red-500">
                      <span className="material-icons-round text-base">delete</span>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modal !== false && (
        <CompanyModal company={modal} onClose={() => setModal(false)} onSaved={handleSaved} />
      )}
    </div>
  );
}
