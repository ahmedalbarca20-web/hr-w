import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { listLeaveRequests, reviewLeave } from '../../api/leave.api';
import Button from '../../components/common/Button';
import Alert from '../../components/common/Alert';
import { listFromPageResponse } from '../../utils/apiResponse';

export default function LeaveApproval() {
  const { t } = useTranslation();

  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [alert,   setAlert]   = useState(null);
  const [acting,  setActing]  = useState(null); // id of row being actioned

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await listLeaveRequests({ status: 'PENDING', limit: 50 });
      const { rows } = listFromPageResponse(data);
      setRows(rows);
    } catch (e) {
      setAlert({ type: 'danger', msg: e.response?.data?.error || 'Failed to load requests' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  const handleReview = async (id, status) => {
    setActing(id);
    setAlert(null);
    try {
      await reviewLeave(id, { status });
      setAlert({ type: 'success', msg: `Request ${status.toLowerCase()} successfully` });
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      setAlert({ type: 'danger', msg: e.response?.data?.error || 'Action failed' });
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="space-y-6">
      {alert && <Alert type={alert.type} message={alert.msg} onClose={() => setAlert(null)} />}

      <div className="md-card" style={{ overflow: 'visible' }}>
        <div
          className="rounded-xl mx-4 -mt-4 p-4 shadow-card-lg mb-6 flex items-center justify-between"
          style={{ background: 'linear-gradient(195deg, #26a69a, #00695c)' }}
        >
          <h2 className="text-white font-semibold text-lg">
            {t('leave.approval_title', 'Leave Approval')}
          </h2>
          <span className="bg-white/25 text-white text-sm px-3 py-1 rounded-full">
            {rows.length} {t('leave.pending', 'Pending')}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-400">
            <span className="material-icons-round animate-spin text-3xl">sync</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 pb-8 text-center text-gray-400">
            <span className="material-icons-round text-5xl mb-2 block">check_circle</span>
            <p>{t('leave.no_pending', 'No pending requests')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto px-6 pb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="p-2 font-semibold">{t('employee.name', 'Employee')}</th>
                  <th className="p-2 font-semibold">{t('leave.type', 'Type')}</th>
                  <th className="p-2 font-semibold">{t('leave.start_date', 'From')}</th>
                  <th className="p-2 font-semibold">{t('leave.end_date', 'To')}</th>
                  <th className="p-2 font-semibold">{t('leave.days_count', 'Days')}</th>
                  <th className="p-2 font-semibold">{t('leave.reason', 'Reason')}</th>
                  <th className="p-2 font-semibold">{t('common.actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-gray-50">
                    <td className="p-2 font-medium">
                      {r.Employee
                        ? `${r.Employee.first_name} ${r.Employee.last_name}`
                        : `#${r.employee_id}`}
                    </td>
                    <td className="p-2 text-gray-600">{r.LeaveType?.name || '—'}</td>
                    <td className="p-2">{r.start_date}</td>
                    <td className="p-2">{r.end_date}</td>
                    <td className="p-2 font-semibold">{r.total_days}</td>
                    <td className="p-2 text-gray-500 max-w-xs truncate">{r.reason || '—'}</td>
                    <td className="p-2 flex gap-2">
                      <Button
                        size="sm"
                        icon="check_circle"
                        loading={acting === r.id}
                        onClick={() => handleReview(r.id, 'APPROVED')}
                      >
                        {t('common.approve', 'Approve')}
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        icon="cancel"
                        loading={acting === r.id}
                        onClick={() => handleReview(r.id, 'REJECTED')}
                      >
                        {t('common.reject', 'Reject')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

