import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Table from '../../components/common/Table';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import Alert from '../../components/common/Alert';
import Badge from '../../components/common/Badge';
import { listShifts, createShift, updateShift, deleteShift, setDefault } from '../../api/shift.api';
import { useAuth } from '../../context/AuthContext';
import { useForm } from 'react-hook-form';

const WEEK_DAYS = [
  { value: 0, label: 'الأحد' },
  { value: 1, label: 'الاثنين' },
  { value: 2, label: 'الثلاثاء' },
  { value: 3, label: 'الأربعاء' },
  { value: 4, label: 'الخميس' },
  { value: 5, label: 'الجمعة' },
  { value: 6, label: 'السبت' },
];

const toLatinDigits = (input) => String(input ?? '')
  .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
  .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

const normalizeTime = (v) => {
  const raw = toLatinDigits(v).trim();
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return raw;
  const hh = m[1].padStart(2, '0');
  const mm = m[2];
  const ss = m[3];
  return ss ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
};

function ShiftForm({ shift, onDone, onCancel }) {
  const { t } = useTranslation();
  const [submitError, setSubmitError] = useState('');
  const baseDefaults = {
    name: '', name_ar: '',
    shift_start: '08:00', shift_end: '17:00',
    standard_hours: 8, grace_minutes: 10, overtime_threshold_minutes: 30,
    break_start: '', break_end: '',
    checkin_window_start: '', checkin_window_end: '',
    checkout_window_start: '', checkout_window_end: '',
    week_starts_on: 1, work_days: [1, 2, 3, 4, 5],
  };
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: shift
      ? {
        ...baseDefaults,
        ...shift,
        work_days: Array.isArray(shift.work_days) ? shift.work_days : [1, 2, 3, 4, 5],
      }
      : baseDefaults,
  });

  const parseDayValues = (v, fallback = []) => {
    if (!v) return fallback;
    const arr = Array.isArray(v) ? v : [v];
    const parsed = arr
      .map((x) => Number(x))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
    return parsed.length > 0 ? [...new Set(parsed)] : fallback;
  };

  const onSubmit = async (values) => {
    setSubmitError('');
    const payload = {
      name: String(values.name || '').trim(),
      name_ar: String(values.name_ar || '').trim(),
      shift_start: normalizeTime(values.shift_start),
      shift_end: normalizeTime(values.shift_end),
      standard_hours: Number(toLatinDigits(values.standard_hours || 8)),
      grace_minutes: Number(toLatinDigits(values.grace_minutes || 0)),
      overtime_threshold_minutes: Number(toLatinDigits(values.overtime_threshold_minutes || 0)),
      break_start: normalizeTime(values.break_start),
      break_end: normalizeTime(values.break_end),
      checkin_window_start: normalizeTime(values.checkin_window_start),
      checkin_window_end: normalizeTime(values.checkin_window_end),
      checkout_window_start: normalizeTime(values.checkout_window_start),
      checkout_window_end: normalizeTime(values.checkout_window_end),
      week_starts_on: Number(toLatinDigits(values.week_starts_on ?? 1)),
      work_days: parseDayValues(values.work_days, [1, 2, 3, 4, 5]),
    };
    try {
      if (shift?.id) await updateShift(shift.id, payload);
      else           await createShift(payload);
      onDone();
    } catch (e) {
      const msg = e?.response?.data?.error
        || e?.response?.data?.message
        || 'Save failed';
      setSubmitError(msg);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {submitError && <Alert type="danger" message={submitError} />}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="label">{t('shift.name')}</label>
          <input className="input" {...register('name', { required: true })} />
        </div>
        <div>
          <label className="label">{t('shift.name_ar')}</label>
          <input className="input" dir="rtl" {...register('name_ar')} />
        </div>
        <div>
          <label className="label">{t('shift.start_time')}</label>
          <input type="time" className="input" {...register('shift_start', { required: true })} />
        </div>
        <div>
          <label className="label">{t('shift.end_time')}</label>
          <input type="time" className="input" {...register('shift_end', { required: true })} />
        </div>
        <div>
          <label className="label">{t('shift.start', 'بداية الاستراحة')}</label>
          <input type="time" className="input" {...register('break_start')} />
        </div>
        <div>
          <label className="label">{t('shift.end', 'نهاية الاستراحة')}</label>
          <input type="time" className="input" {...register('break_end')} />
        </div>
        <div>
          <label className="label">{t('shift.checkin_window_start', 'بداية تسجيل الدخول')}</label>
          <input type="time" className="input" {...register('checkin_window_start')} />
        </div>
        <div>
          <label className="label">{t('shift.checkin_window_end', 'نهاية تسجيل الدخول')}</label>
          <input type="time" className="input" {...register('checkin_window_end')} />
        </div>
        <div>
          <label className="label">{t('shift.checkout_window_start', 'بداية تسجيل الخروج')}</label>
          <input type="time" className="input" {...register('checkout_window_start')} />
        </div>
        <div>
          <label className="label">{t('shift.checkout_window_end', 'نهاية تسجيل الخروج')}</label>
          <input type="time" className="input" {...register('checkout_window_end')} />
        </div>
        <div>
          <label className="label">{t('shift.standard_hours', 'Standard hours')}</label>
          <input type="number" step="0.5" className="input" {...register('standard_hours')} />
        </div>
        <div>
          <label className="label">{t('shift.tolerance_minutes')}</label>
          <input type="number" className="input" {...register('grace_minutes')} />
        </div>
        <div>
          <label className="label">{t('shift.overtime_threshold')}</label>
          <input type="number" className="input" {...register('overtime_threshold_minutes')} />
        </div>
        <div>
          <label className="label">{t('shift.week_start', 'Week starts on')}</label>
          <select className="input" {...register('week_starts_on')}>
            {WEEK_DAYS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="label">{t('shift.work_days')}</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-xl border border-gray-200 p-3">
            {WEEK_DAYS.map((d) => (
              <label key={d.value} className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  value={d.value}
                  {...register('work_days')}
                />
                {d.label}
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="ghost" type="button" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button type="submit" loading={isSubmitting}>{t('common.save')}</Button>
      </div>
    </form>
  );
}

export default function ShiftList() {
  const { t }    = useTranslation();
  const { user } = useAuth();
  const roleName = typeof user?.role === 'object' ? user?.role?.name : user?.role;
  const canMutateShifts = ['ADMIN', 'SUPER_ADMIN'].includes(roleName) || user?.is_super_admin;

  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(false);
  const [editing, setEditing]   = useState(null);
  const [alert, setAlert]       = useState(null);

  const dayName = (n) => {
    const hit = WEEK_DAYS.find((d) => d.value === Number(n));
    return hit ? hit.label : String(n);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await listShifts();
      setRows(data.data?.shifts || data.data || []);
    } catch { setRows([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async (id) => {
    if (!window.confirm(t('common.confirm_delete'))) return;
    try { await deleteShift(id); fetchData(); }
    catch (e) { setAlert({ type: 'danger', msg: e.response?.data?.error || 'Error' }); }
  };

  const handleSetDefault = async (id) => {
    try {
      await setDefault(id);
      setAlert({ type: 'success', msg: t('shift.default_set') });
      fetchData();
    } catch (e) { setAlert({ type: 'danger', msg: e.response?.data?.error || 'Error' }); }
  };

  const COLUMNS = [
    { key: 'name', label: t('shift.name') },
    { key: 'shift_start', label: t('shift.start_time') },
    { key: 'shift_end',   label: t('shift.end_time') },
    {
      key: 'work_days',
      label: t('shift.work_days'),
      render: (r) => (Array.isArray(r.work_days) ? r.work_days.map(dayName).join(', ') : '—'),
    },
    { key: 'grace_minutes', label: t('shift.tolerance_minutes'), render: (r) => `${r.grace_minutes ?? 0} min` },
    {
      key: 'is_default', label: t('shift.default'),
      render: (r) => r.is_default ? <Badge status="ACTIVE" label={t('shift.default')} /> : null,
    },
    canMutateShifts && {
      key: 'actions', label: t('common.actions'),
      render: (row) => (
        <div className="flex gap-2">
          <button onClick={() => { setEditing(row); setModal(true); }} className="text-brand hover:opacity-70" title={t('common.edit')}>
            <span className="material-icons-round text-base">edit</span>
          </button>
          {!row.is_default && (
            <button onClick={() => handleSetDefault(row.id)} className="text-success hover:opacity-70" title={t('shift.set_default')}>
              <span className="material-icons-round text-base">star</span>
            </button>
          )}
          <button onClick={() => handleDelete(row.id)} className="text-danger hover:opacity-70" title={t('common.delete')}>
            <span className="material-icons-round text-base">delete</span>
          </button>
        </div>
      ),
    },
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      {alert && <Alert type={alert.type} message={alert.msg} onClose={() => setAlert(null)} />}

      <div className="md-card" style={{ overflow: 'visible' }}>
        <div
          className="rounded-xl mx-4 -mt-4 p-4 shadow-card-lg mb-4 flex items-center justify-between gap-3"
          style={{ background: 'linear-gradient(195deg, #0288d1, #01579b)' }}
        >
          <h2 className="text-white font-semibold">{t('shift.title')}</h2>
          {canMutateShifts && (
            <Button icon="add" onClick={() => { setEditing(null); setModal(true); }}>{t('shift.add')}</Button>
          )}
        </div>

        <Table columns={COLUMNS} rows={rows} loading={loading} />
      </div>

      <Modal open={modal} onClose={() => { setModal(false); setEditing(null); }} title={editing ? t('common.edit') : t('shift.add')} size="xl">
        <ShiftForm
          shift={editing}
          onDone={() => { setModal(false); setEditing(null); fetchData(); }}
          onCancel={() => { setModal(false); setEditing(null); }}
        />
      </Modal>
    </div>
  );
}
