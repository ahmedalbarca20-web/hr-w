import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import Table from '../../components/common/Table';
import {
  createLeaveType,
  deactivateLeaveType,
  listLeaveTypes,
  updateLeaveType,
} from '../../api/leave.api';

function LeaveTypeForm({ initialData, onDone, onCancel }) {
  const { t } = useTranslation();
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      name: initialData?.name || '',
      name_ar: initialData?.name_ar || '',
      max_days_per_year: initialData?.max_days_per_year ?? 0,
      is_paid: Number(initialData?.is_paid ?? 1),
      requires_approval: Number(initialData?.requires_approval ?? 1),
      is_active: Number(initialData?.is_active ?? 1),
    },
  });

  const onSubmit = async (values) => {
    setError('');
    try {
      const payload = {
        ...values,
        max_days_per_year: Number(values.max_days_per_year || 0),
        is_paid: Number(values.is_paid),
        requires_approval: Number(values.requires_approval),
        is_active: Number(values.is_active),
      };
      if (initialData?.id) {
        await updateLeaveType(initialData.id, payload);
      } else {
        await createLeaveType(payload);
      }
      onDone();
    } catch (e) {
      setError(e.response?.data?.error || e.response?.data?.message || 'Error');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {error && <Alert type="danger" message={error} />}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="label">{t('leave.type_name', 'اسم نوع الإجازة')}</label>
          <input
            className={`input ${errors.name ? 'border-danger' : ''}`}
            {...register('name', { required: t('leave.type_name_required', 'اسم النوع مطلوب') })}
          />
        </div>
        <div>
          <label className="label">{t('leave.type_name_ar', 'الاسم بالعربي')}</label>
          <input className="input" {...register('name_ar')} />
        </div>
        <div>
          <label className="label">{t('leave.max_days_per_year')}</label>
          <input type="number" min="0" className="input" {...register('max_days_per_year')} />
          <p className="mt-1 text-xs text-gray-500">{t('leave.max_days_hint')}</p>
        </div>
        <div>
          <label className="label">{t('leave.paid_status', 'مدفوعة الأجر')}</label>
          <select className="input" {...register('is_paid')}>
            <option value={1}>{t('common.yes', 'نعم')}</option>
            <option value={0}>{t('common.no', 'لا')}</option>
          </select>
        </div>
        <div>
          <label className="label">{t('leave.requires_approval', 'تحتاج موافقة')}</label>
          <select className="input" {...register('requires_approval')}>
            <option value={1}>{t('common.yes', 'نعم')}</option>
            <option value={0}>{t('common.no', 'لا')}</option>
          </select>
        </div>
        <div>
          <label className="label">{t('leave.active_status', 'الحالة')}</label>
          <select className="input" {...register('is_active')}>
            <option value={1}>{t('common.active', 'نشط')}</option>
            <option value={0}>{t('common.inactive', 'غير نشط')}</option>
          </select>
        </div>
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

export default function LeaveTypes() {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const fetchTypes = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await listLeaveTypes();
      const payload = data?.data;
      setRows(Array.isArray(payload) ? payload : []);
    } catch (e) {
      setAlert({ type: 'danger', msg: e.response?.data?.error || 'Failed to load leave types' });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTypes();
  }, [fetchTypes]);

  const onDeactivate = async (id) => {
    try {
      await deactivateLeaveType(id);
      setAlert({ type: 'success', msg: t('leave.type_deactivated', 'تم تعطيل نوع الإجازة') });
      fetchTypes();
    } catch (e) {
      setAlert({ type: 'danger', msg: e.response?.data?.error || 'Action failed' });
    }
  };

  const COLUMNS = [
    { key: 'name', label: t('leave.type_name', 'نوع الإجازة'), render: (r) => r.name_ar || r.name || '—' },
    { key: 'max_days_per_year', label: t('leave.table_policy_days') },
    {
      key: 'is_paid',
      label: t('leave.paid_status', 'مدفوعة'),
      render: (r) => (Number(r.is_paid) ? t('common.yes', 'نعم') : t('common.no', 'لا')),
    },
    {
      key: 'is_active',
      label: t('leave.active_status', 'الحالة'),
      render: (r) => (Number(r.is_active) ? t('common.active', 'نشط') : t('common.inactive', 'غير نشط')),
    },
    {
      key: 'actions',
      label: t('common.actions'),
      render: (r) => (
        <div className="flex items-center gap-2">
          <button
            className="text-info hover:opacity-80"
            onClick={() => {
              setEditing(r);
              setOpen(true);
            }}
            title={t('common.edit')}
          >
            <span className="material-icons-round text-base">edit</span>
          </button>
          {Number(r.is_active) === 1 && (
            <button
              className="text-danger hover:opacity-80"
              onClick={() => onDeactivate(r.id)}
              title={t('common.delete')}
            >
              <span className="material-icons-round text-base">block</span>
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {alert && <Alert type={alert.type} message={alert.msg} onClose={() => setAlert(null)} />}
      <div className="md-card" style={{ overflow: 'visible' }}>
        <div
          className="rounded-xl mx-4 -mt-4 p-4 shadow-card-lg mb-4 flex items-start justify-between gap-3"
          style={{ background: 'linear-gradient(195deg, #7e57c2, #5e35b1)' }}
        >
          <div>
            <h2 className="text-white font-semibold">{t('leave.types_title')}</h2>
            <p className="text-white/85 text-xs mt-1 max-w-xl leading-relaxed">{t('leave.types_subtitle')}</p>
          </div>
          <Button
            icon="add"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            {t('leave.add_type', 'إضافة نوع إجازة')}
          </Button>
        </div>
        <Table columns={COLUMNS} rows={rows} loading={loading} />
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? t('leave.edit_type', 'تعديل نوع الإجازة') : t('leave.add_type', 'إضافة نوع إجازة')}
      >
        <LeaveTypeForm
          initialData={editing}
          onDone={() => {
            setOpen(false);
            fetchTypes();
          }}
          onCancel={() => setOpen(false)}
        />
      </Modal>
    </div>
  );
}
