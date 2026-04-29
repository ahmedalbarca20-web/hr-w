import { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import Button from '../common/Button';
import Alert from '../common/Alert';
import { createEmployee, updateEmployee, listDepts } from '../../api/employee.api';
import { listShifts } from '../../api/shift.api';
import { listLeaveTypes, listLeaveBalances } from '../../api/leave.api';
import { useAuth } from '../../context/AuthContext';
import { useTenantCompanyId } from '../../hooks/useTenantCompanyId';
import { isSuperAdminUser } from '../../utils/tenantScope';

export default function EmployeeForm({ initial, onDone, onCancel }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, hasFeature } = useAuth();
  const companyId = useTenantCompanyId(user);
  const [depts, setDepts]   = useState([]);
  const [shifts, setShifts] = useState([]);
  const [error, setError]   = useState('');
  const [leaveYear, setLeaveYear] = useState(() => new Date().getFullYear());
  const [leaveTypesCapped, setLeaveTypesCapped] = useState([]);
  const [leaveBalancesRows, setLeaveBalancesRows] = useState([]);

  const { register, handleSubmit, formState: { isSubmitting, errors } } = useForm({
    defaultValues: initial ? {
      first_name    : initial.first_name ?? '',
      last_name     : initial.last_name ?? '',
      email         : initial.email ?? '',
      employee_number : initial.employee_number ?? initial.employee_code ?? '',
      position      : initial.position ?? '',
      department_id : initial.department_id ?? '',
      shift_id      : initial.shift_id ?? '',
      hire_date     : initial.hire_date?.substring(0, 10) ?? '',
      base_salary   : initial.base_salary ?? '',
    } : {
      first_name    : '',
      last_name     : '',
      email         : '',
      employee_number : '',
      position      : '',
      department_id : '',
      shift_id      : '',
      hire_date     : '',
      base_salary   : '',
    },
  });

  useEffect(() => {
    if (!companyId) {
      setDepts([]);
      setShifts([]);
      return;
    }
    listDepts({ page: 1, limit: 1000 }).then(({ data }) => {
      const rows = data?.data?.data || data?.data?.departments || data?.data || [];
      setDepts(Array.isArray(rows) ? rows : []);
    }).catch(() => setDepts([]));
    listShifts({ include_inactive: false }).then(({ data }) => {
      const rows = data?.data?.shifts || data?.data || [];
      setShifts(Array.isArray(rows) ? rows : []);
    }).catch(() => setShifts([]));
  }, [companyId]);

  const typeLabel = useCallback((lt) => {
    if (i18n.language?.startsWith('ar')) return lt.name_ar || lt.name || `Type #${lt.id}`;
    return lt.name || lt.name_ar || `Type #${lt.id}`;
  }, [i18n.language]);

  useEffect(() => {
    if (!hasFeature('leaves')) {
      setLeaveTypesCapped([]);
      setLeaveBalancesRows([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data: typesWrap } = await listLeaveTypes();
        const types = Array.isArray(typesWrap?.data) ? typesWrap.data : [];
        if (cancelled) return;
        const capped = types.filter((lt) => lt.is_active && Number(lt.max_days_per_year) > 0);
        setLeaveTypesCapped(capped);

        if (!initial?.id) {
          setLeaveBalancesRows([]);
          return;
        }

        const { data: balWrap } = await listLeaveBalances({
          employee_id: initial.id,
          year: leaveYear,
        });
        const bals = Array.isArray(balWrap?.data) ? balWrap.data : [];
        if (!cancelled) setLeaveBalancesRows(bals);
      } catch {
        if (!cancelled) {
          setLeaveTypesCapped([]);
          setLeaveBalancesRows([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [hasFeature, initial?.id, leaveYear]);

  const normalizePayload = (values, companyId) => {
    const department_id = values.department_id ? Number(values.department_id) : null;
    const shift_id = values.shift_id ? Number(values.shift_id) : null;
    const base_salary = values.base_salary === '' || values.base_salary == null
      ? 0
      : Number(values.base_salary);
    return {
      company_id: companyId,
      first_name: String(values.first_name || '').trim(),
      last_name: String(values.last_name || '').trim(),
      email: String(values.email || '').trim().toLowerCase() || null,
      employee_number: String(values.employee_number || '').trim().toUpperCase(),
      department_id: Number.isInteger(department_id) && department_id > 0 ? department_id : null,
      shift_id: Number.isInteger(shift_id) && shift_id > 0 ? shift_id : null,
      hire_date: values.hire_date,
      base_salary: Number.isFinite(base_salary) ? base_salary : 0,
    };
  };

  const onSubmit = async (values) => {
    setError('');
    try {
      if (!companyId) {
        setError('Company context is required');
        return;
      }
      const payload = normalizePayload(values, companyId);

      if (initial) await updateEmployee(initial.id, payload);
      else await createEmployee(payload);
      onDone();
    } catch (e) {
      setError(e.message || e.response?.data?.error || e.response?.data?.message || 'Error');
    }
  };

  const F = ({ name, label, type = 'text', required, ...rest }) => (
    <div>
      <label className="label">{label}</label>
      <input
        type={type}
        className={`input ${errors[name] ? 'border-danger' : ''}`}
        {...register(name, required ? { required: `${label} is required` } : {})}
        {...rest}
      />
      {errors[name] && <p className="mt-1 text-xs text-danger">{errors[name].message}</p>}
    </div>
  );

  const showLeaveBalances = hasFeature('leaves');

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {error && <Alert type="danger" message={error} />}

      {!companyId && isSuperAdminUser(user) && (
        <Alert
          type="warning"
          message={t(
            'employee.super_admin_no_company',
            'لا توجد شركة نشطة. افتح «الشركات» وأنشئ شركة أو فعّل شركة ثم أعد المحاولة.',
          )}
        />
      )}

      <div className="grid grid-cols-2 gap-4">
        <F name="first_name" label={t('employee.name') + ' (First)'} required />
        <F name="last_name"  label={t('employee.name') + ' (Last)'}  required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <F name="email"         label={t('auth.email')}         type="email" required />
        <F
          name="employee_number"
          label={t('employee.biometric_code')}
          required
          placeholder={t('employee.biometric_code_placeholder', 'مثال: EMP-002')}
          onInput={(e) => { e.target.value = e.target.value.toUpperCase(); }}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <F name="position"  label={t('employee.position')} />
        <div>
          <label className="label">{t('employee.department')}</label>
          <select className="input" {...register('department_id')}>
            <option value="">—</option>
            {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">{t('shift.title', 'Shift')}</label>
          <select className="input" {...register('shift_id')}>
            <option value="">{t('common.none', '—')}</option>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name || s.name_ar || `Shift #${s.id}`}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <F name="hire_date"    label={t('employee.hire_date')} type="date" required />
        <F name="base_salary"  label={t('employee.base_salary')} type="number" />
      </div>

      {showLeaveBalances && (
        <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-semibold text-gray-800 text-sm">{t('employee.leave_balance_title')}</h4>
            <button
              type="button"
              className="btn-ghost text-xs gap-1"
              onClick={() => navigate('/leaves/types')}
            >
              <span className="material-icons-round text-sm">policy</span>
              {t('employee.leave_balance_open_policy')}
            </button>
          </div>

          {leaveTypesCapped.length === 0 ? (
            <p className="text-xs text-gray-600 leading-relaxed">{t('employee.leave_balance_none_capped')}</p>
          ) : initial?.id ? (
            <>
              <div className="flex flex-wrap gap-3 items-center">
                <label className="text-xs text-gray-600">{t('employee.leave_balance_year')}</label>
                <input
                  type="number"
                  className="input w-28 text-sm"
                  value={leaveYear}
                  onChange={(e) => setLeaveYear(Number(e.target.value))}
                  min={2000}
                  max={2100}
                />
              </div>
              <div className="overflow-x-auto rounded-lg border border-violet-100/80 bg-white/70">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-violet-50/90 text-left text-xs text-gray-600 border-b border-violet-100">
                      <th className="px-3 py-2 font-semibold">{t('leave.type')}</th>
                      <th className="px-3 py-2 font-semibold">{t('employee.leave_balance_policy_days')}</th>
                      <th className="px-3 py-2 font-semibold">{t('employee.leave_balance_recorded')}</th>
                      <th className="px-3 py-2 font-semibold">{t('employee.leave_balance_used')}</th>
                      <th className="px-3 py-2 font-semibold">{t('employee.leave_balance_pending')}</th>
                      <th className="px-3 py-2 font-semibold">{t('employee.leave_balance_remaining')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-violet-50">
                    {leaveTypesCapped.map((lt) => {
                      const b = leaveBalancesRows.find((x) => Number(x.leave_type_id) === Number(lt.id));
                      const policy = Number(lt.max_days_per_year);
                      const total = b != null ? Number(b.total_days) : null;
                      const used = Number(b?.used_days || 0);
                      const pend = Number(b?.pending_days || 0);
                      const rem = total != null && Number.isFinite(total)
                        ? Math.max(0, total - used - pend)
                        : null;
                      return (
                        <tr key={lt.id}>
                          <td className="px-3 py-2 font-medium text-gray-800">{typeLabel(lt)}</td>
                          <td className="px-3 py-2 text-gray-600">{policy}</td>
                          <td className="px-3 py-2 text-gray-600">{total != null ? total : '—'}</td>
                          <td className="px-3 py-2 text-gray-600">{b ? used : '—'}</td>
                          <td className="px-3 py-2 text-gray-600">{b ? pend : '—'}</td>
                          <td className="px-3 py-2 text-gray-800 font-medium">{rem != null ? rem : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">{t('employee.leave_balance_hint')}</p>
            </>
          ) : (
            <div className="text-xs text-gray-700 space-y-2">
              <p className="leading-relaxed">{t('employee.leave_balance_hint')}</p>
              <ul className="rounded-lg bg-white/60 border border-violet-100/80 px-3 py-2 space-y-1">
                {leaveTypesCapped.map((lt) => (
                  <li key={lt.id} className="flex justify-between gap-2">
                    <span className="font-medium text-gray-800">{typeLabel(lt)}</span>
                    <span className="text-gray-600 tabular-nums">
                      {Number(lt.max_days_per_year)} {t('leave.days')} · {t('employee.leave_balance_year')}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
        <Button variant="ghost" type="button" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button type="submit" loading={isSubmitting}>{t('common.save')}</Button>
      </div>
    </form>
  );
}
