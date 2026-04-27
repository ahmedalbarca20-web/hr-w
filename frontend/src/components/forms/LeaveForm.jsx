import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import Button from '../common/Button';
import Alert from '../common/Alert';
import { listLeaveTypes, createLeaveRequest } from '../../api/leave.api';

export default function LeaveForm({ onDone, onCancel }) {
  const { t }              = useTranslation();
  const [types, setTypes]  = useState([]);
  const [error, setError]  = useState('');

  const {
    register,
    handleSubmit,
    watch,
    formState: { isSubmitting, errors },
  } = useForm();

  const selectedTypeId = watch('leave_type_id');
  const selectedType   = types.find((lt) => String(lt.id) === String(selectedTypeId));

  useEffect(() => {
    listLeaveTypes().then(({ data }) => {
      const payload = data?.data;
      const parsedTypes = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.types)
          ? payload.types
          : [];
      setTypes(parsedTypes);
    });
  }, []);

  const onSubmit = async (values) => {
    setError('');
    try {
      const start = String(values.start_date || '').trim();
      const end = String(values.end_date || '').trim();
      const s = new Date(`${start}T12:00:00`);
      const e = new Date(`${end}T12:00:00`);
      const total_days = Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s
        ? 1
        : Math.floor((e - s) / 86400000) + 1;
      await createLeaveRequest({
        leave_type_id: Number(values.leave_type_id),
        start_date: start,
        end_date: end,
        total_days,
        reason: values.reason?.trim() ? String(values.reason).trim() : null,
      });
      onDone();
    } catch (e) {
      setError(e.response?.data?.error || e.response?.data?.message || 'Error');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {error && <Alert type="danger" message={error} />}

      {/* Leave type + quick info */}
      <div className="space-y-2">
        <label className="label">{t('leave.type')}</label>
        <select
          className={`input bg-gray-50 ${errors.leave_type_id ? 'border-danger' : ''}`}
          {...register('leave_type_id', { required: t('leave.type_required', 'Leave type is required') })}
        >
          <option value="">{t('leave.select_type', 'اختر نوع الإجازة')}</option>
          {types.map((lt) => (
            <option key={lt.id} value={lt.id}>
              {(lt.name_ar || lt.name) +
                (lt.max_days_per_year > 0 ? ` · ${lt.max_days_per_year} ${t('leave.days','days')}` : '')}
            </option>
          ))}
        </select>
        {errors.leave_type_id && (
          <p className="mt-1 text-xs text-danger">{errors.leave_type_id.message}</p>
        )}

        {selectedType && (
          <div className="mt-2 rounded-xl border border-gray-100 bg-gradient-to-r from-emerald-50 to-teal-50 px-4 py-3 text-xs text-gray-700 flex items-start gap-3">
            <span className="material-icons-round text-base text-emerald-500 mt-0.5">
              beach_access
            </span>
            <div className="space-y-1">
              <p className="font-semibold text-sm">
                {selectedType.name_ar || selectedType.name}
              </p>
              <div className="flex flex-wrap gap-2">
                {selectedType.max_days_per_year > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-white/70 text-emerald-700 font-medium">
                    {t('leave.max_per_year', {
                      defaultValue: 'حتى {{days}} يوم في السنة',
                      days: selectedType.max_days_per_year,
                    })}
                  </span>
                )}
                <span className="px-2 py-0.5 rounded-full bg-white/70 text-emerald-700 font-medium">
                  {selectedType.is_paid ? t('leave.paid', 'مدفوعة الأجر') : t('leave.unpaid', 'بدون أجر')}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Dates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">{t('leave.start')}</label>
          <input
            type="date"
            className={`input ${errors.start_date ? 'border-danger' : ''}`}
            {...register('start_date', { required: t('leave.start_required', 'Start date required') })}
          />
        </div>
        <div>
          <label className="label">{t('leave.end')}</label>
          <input
            type="date"
            className={`input ${errors.end_date ? 'border-danger' : ''}`}
            {...register('end_date', { required: t('leave.end_required', 'End date required') })}
          />
        </div>
      </div>

      {/* Reason */}
      <div>
        <label className="label">{t('leave.reason')}</label>
        <textarea
          rows={3}
          className="input resize-none"
          placeholder={t('leave.reason_placeholder', 'اكتب سبب الإجازة (اختياري)')}
          {...register('reason')}
        />
      </div>

      <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
        <Button variant="ghost" type="button" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  );
}

