import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import Table from '../../components/common/Table';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import Alert from '../../components/common/Alert';
import LeaveForm from '../../components/forms/LeaveForm';
import { listLeaveRequests, reviewLeave } from '../../api/leave.api';
import { useAuth } from '../../context/AuthContext';
import { listFromPageResponse } from '../../utils/apiResponse';

export default function LeaveList() {
  const { t }   = useTranslation();
  const { user } = useAuth();
  const roleName = typeof user?.role === 'object' ? user?.role?.name : user?.role;
  const isAdmin  = ['ADMIN','HR','SUPER_ADMIN'].includes(roleName);

  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [page, setPage]         = useState(1);
  const [totalPages, setTP]     = useState(1);
  const [modal, setModal]       = useState(false);
  const [alert, setAlert]       = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await listLeaveRequests({ page, limit: 10 });
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

  const handleReview = async (id, status) => {
    try {
      await reviewLeave(id, { status });
      setAlert({ type: 'success', msg: `${status}` });
      fetchData();
    } catch (e) {
      setAlert({ type: 'danger', msg: e.response?.data?.message || 'Error' });
    }
  };

  const COLUMNS = [
    {
      key: 'employee', label: t('employee.name'),
      render: (row) => {
        const emp = row.employee || row.Employee;
        return `${emp?.first_name || ''} ${emp?.last_name || ''}`.trim() || '—';
      },
    },
    {
      key: 'type', label: t('leave.type'),
      render: (row) => {
        const type = row.leaveType || row.LeaveType;
        return type?.name_ar || type?.name || '—';
      },
    },
    { key: 'start_date', label: t('leave.start') },
    { key: 'end_date',   label: t('leave.end')   },
    { key: 'total_days', label: t('leave.days')  },
    {
      key: 'status', label: t('leave.status'),
      render: (row) => <Badge status={row.status} label={t(`leave.${row.status?.toLowerCase()}`)} />,
    },
    isAdmin && {
      key: 'actions', label: t('common.actions'),
      render: (row) => row.status === 'PENDING' ? (
        <div className="flex gap-2">
          <button
            onClick={() => handleReview(row.id, 'APPROVED')}
            className="text-success hover:opacity-70"
            title="Approve"
          >
            <span className="material-icons-round text-base">check_circle</span>
          </button>
          <button
            onClick={() => handleReview(row.id, 'REJECTED')}
            className="text-danger hover:opacity-70"
            title="Reject"
          >
            <span className="material-icons-round text-base">cancel</span>
          </button>
        </div>
      ) : null,
    },
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      {alert && <Alert type={alert.type} message={alert.message || alert.msg} onClose={() => setAlert(null)} />}

      <div className="md-card" style={{ overflow: 'visible' }}>
        <div
          className="rounded-xl mx-4 -mt-4 p-4 shadow-card-lg mb-4
                     flex items-center justify-between gap-3"
          style={{ background: 'linear-gradient(195deg, #66bb6a, #388e3c)' }}
        >
          <h2 className="text-white font-semibold">{t('leave.title')}</h2>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Link to="/leaves/types">
                <Button variant="ghost" icon="event_available">
                  {t('leave.types_title', 'أنواع الإجازات')}
                </Button>
              </Link>
            )}
            <Button icon="add" onClick={() => setModal(true)}>
              {t('leave.new_request')}
            </Button>
          </div>
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

      <Modal open={modal} onClose={() => setModal(false)} title={t('leave.new_request')}>
        <LeaveForm
          onDone={() => { setModal(false); fetchData(); }}
          onCancel={() => setModal(false)}
        />
      </Modal>
    </div>
  );
}

