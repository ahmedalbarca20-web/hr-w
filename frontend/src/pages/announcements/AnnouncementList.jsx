import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Table from '../../components/common/Table';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import Alert from '../../components/common/Alert';
import Badge from '../../components/common/Badge';
import { listAnnouncements, createAnnouncement, deleteAnnouncement } from '../../api/announcement.api';
import { useAuth } from '../../context/AuthContext';
import { listFromPageResponse } from '../../utils/apiResponse';
import { useForm } from 'react-hook-form';

function AnnouncementForm({ onDone, onCancel }) {
  const { t } = useTranslation();
  const { register, handleSubmit, formState: { isSubmitting } } = useForm();
  const [formError, setFormError] = useState('');

  const onSubmit = async (values) => {
    setFormError('');
    try {
      const payload = {
        ...values,
        expires_at: values.expires_at ? `${values.expires_at}T23:59:59.000Z` : null,
        is_pinned: values.is_pinned ? 1 : 0,
      };
      await createAnnouncement(payload);
      onDone();
    } catch (e) {
      setFormError(e.response?.data?.error || e.response?.data?.message || t('common.error', 'Error'));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {formError && <Alert type="danger" message={formError} onClose={() => setFormError('')} />}
      <div>
        <label className="label">{t('announcement.title_field')}</label>
        <input className="input" {...register('title', { required: true })} />
      </div>
      <div>
        <label className="label">{t('announcement.title_ar')}</label>
        <input className="input" dir="rtl" {...register('title_ar')} />
      </div>
      <div>
        <label className="label">{t('announcement.body')}</label>
        <textarea rows={4} className="input" {...register('body', { required: true })} />
      </div>
      <div>
        <label className="label">{t('announcement.expires_at')}</label>
        <input type="date" className="input" {...register('expires_at')} />
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="pinned" className="rounded" {...register('is_pinned')} />
        <label htmlFor="pinned" className="label mb-0">{t('announcement.pinned')}</label>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="ghost" type="button" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button type="submit" loading={isSubmitting}>{t('common.save')}</Button>
      </div>
    </form>
  );
}

export default function AnnouncementList() {
  const { t }    = useTranslation();
  const { user } = useAuth();
  const roleName = typeof user?.role === 'object' ? user?.role?.name : user?.role;
  const isAdmin  = ['ADMIN', 'SUPER_ADMIN'].includes(roleName) || user?.is_super_admin;

  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage]       = useState(1);
  const [totalPages, setTP]   = useState(1);
  const [modal, setModal]     = useState(false);
  const [alert, setAlert]     = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await listAnnouncements({ page, limit: 10 });
      const { rows, totalPages } = listFromPageResponse(data);
      setRows(rows);
      setTP(totalPages);
    } catch { setRows([]); }
    finally { setLoading(false); }
  }, [page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async (id) => {
    if (!window.confirm(t('common.confirm_delete'))) return;
    try {
      await deleteAnnouncement(id);
      fetchData();
    } catch (e) {
      setAlert({ type: 'danger', msg: e.response?.data?.error || 'Error' });
    }
  };

  const COLUMNS = [
    {
      key: 'title', label: t('announcement.title_field'),
      render: (row) => (
        <div>
          <p className="font-medium">{row.is_pinned ? '📌 ' : ''}{row.title}</p>
          {row.body && <p className="text-xs text-gray-500 truncate max-w-xs">{row.body}</p>}
        </div>
      ),
    },
    {
      key: 'published_at', label: t('announcement.published'),
      render: (row) => row.published_at ? new Date(row.published_at).toLocaleDateString() : '—',
    },
    {
      key: 'expires_at', label: t('announcement.expires'),
      render: (row) => row.expires_at ? new Date(row.expires_at).toLocaleDateString() : t('announcement.no_expiry'),
    },
    isAdmin && {
      key: 'actions', label: t('common.actions'),
      render: (row) => (
        <button onClick={() => handleDelete(row.id)} className="text-danger hover:opacity-70" title={t('common.delete')}>
          <span className="material-icons-round text-base">delete</span>
        </button>
      ),
    },
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      {alert && <Alert type={alert.type} message={alert.message || alert.msg} onClose={() => setAlert(null)} />}

      <div className="md-card" style={{ overflow: 'visible' }}>
        <div
          className="rounded-xl mx-4 -mt-4 p-4 shadow-card-lg mb-4 flex items-center justify-between gap-3"
          style={{ background: 'linear-gradient(195deg, #26c6da, #00838f)' }}
        >
          <h2 className="text-white font-semibold">{t('announcement.title')}</h2>
          {isAdmin && (
            <Button icon="add" onClick={() => setModal(true)}>{t('announcement.add')}</Button>
          )}
        </div>

        <Table
          columns={COLUMNS}
          rows={rows}
          loading={loading}
          page={page}
          totalPages={totalPages}
          onPage={setPage}
        />
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={t('announcement.add')}>
        <AnnouncementForm onDone={() => { setModal(false); fetchData(); }} onCancel={() => setModal(false)} />
      </Modal>
    </div>
  );
}
