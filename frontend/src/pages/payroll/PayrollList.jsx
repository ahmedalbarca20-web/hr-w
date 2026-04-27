import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Table from '../../components/common/Table';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import Alert from '../../components/common/Alert';
import { listRuns, createRun, processRun, updateRunStatus } from '../../api/payroll.api';
import { useForm } from 'react-hook-form';
import { listFromPageResponse } from '../../utils/apiResponse';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function NewRunForm({ onDone, onCancel }) {
  const { t } = useTranslation();
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: { month: new Date().getMonth() + 1, year: new Date().getFullYear() },
  });

  const onSubmit = async (values) => {
    await createRun({ month: +values.month, year: +values.year });
    onDone();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">{t('payroll.month')}</label>
          <select className="input" {...register('month')}>
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="label">{t('payroll.year')}</label>
          <input type="number" className="input" {...register('year')} />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="ghost" onClick={onCancel} type="button">{t('common.cancel')}</Button>
        <Button type="submit" loading={isSubmitting}>{t('payroll.new_run')}</Button>
      </div>
    </form>
  );
}

export default function PayrollList() {
  const { t, i18n } = useTranslation();
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [page, setPage]         = useState(1);
  const [totalPages, setTP]     = useState(1);
  const [modal, setModal]       = useState(false);
  const [alert, setAlert]       = useState(null);
  const [processing, setProc]   = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await listRuns({ page, limit: 10 });
      const { rows, totalPages } = listFromPageResponse(data);
      setRows(rows);
      setTP(totalPages);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleProcess = async (id) => {
    setProc(id);
    try {
      await processRun(id, {});
      setAlert({ type: 'success', msg: 'Payroll processed successfully' });
      fetchData();
    } catch (e) {
      setAlert({ type: 'danger', msg: e.response?.data?.message || 'Error' });
    } finally {
      setProc(null);
    }
  };

  const COLUMNS = [
    {
      key: 'period', label: t('payroll.run'),
      render: (row) => {
        const m = row.run_month ?? row.month;
        const y = row.run_year ?? row.year;
        if (!m || !y) return '—';
        return `${MONTHS[m - 1]} ${y}`;
      },
    },
    {
      key: 'status', label: t('payroll.status'),
      render: (row) => <Badge status={row.status} label={t(`payroll.${row.status?.toLowerCase()}`)} />,
    },
    {
      key: 'total_net', label: t('payroll.net_salary'),
      render: (row) => {
        const net = row.total_net ?? row.total_net_salary;
        return net != null && net !== '' ? Number(net).toLocaleString() : '—';
      },
    },
    { 
      key: 'created_at', 
      label: t('common.created_at', 'Created'),
      render: (row) => row.created_at ? new Date(row.created_at).toLocaleDateString(i18n.language) : '—'
    },
    {
      key: 'actions', label: t('common.actions'),
      render: (row) => row.status === 'DRAFT' ? (
        <Button
          size="sm"
          icon="play_arrow"
          loading={processing === row.id}
          onClick={() => handleProcess(row.id)}
        >
          {t('payroll.process')}
        </Button>
      ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      {alert && <Alert type={alert.type} message={alert.message || alert.msg} onClose={() => setAlert(null)} />}

      <div className="md-card" style={{ overflow: 'visible' }}>
        <div
          className="rounded-xl mx-4 -mt-4 p-4 shadow-card-lg mb-4
                     flex items-center justify-between gap-3"
          style={{ background: 'linear-gradient(195deg, #ffa726, #f57c00)' }}
        >
          <h2 className="text-white font-semibold">{t('payroll.title')}</h2>
          <Button icon="add" onClick={() => setModal(true)}>
            {t('payroll.new_run')}
          </Button>
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

      <Modal open={modal} onClose={() => setModal(false)} title={t('payroll.new_run')}>
        <NewRunForm onDone={() => { setModal(false); fetchData(); }} onCancel={() => setModal(false)} />
      </Modal>
    </div>
  );
}

