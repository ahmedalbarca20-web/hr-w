import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Table from '../../components/common/Table';
import Badge from '../../components/common/Badge';
import {
  listAttendance,
  activateSurpriseAttendance,
  cancelSurpriseAttendance,
  getActiveSurpriseAttendance,
  listAttendanceRequests,
  reviewAttendanceRequest,
} from '../../api/attendance.api';
import { useAuth } from '../../context/AuthContext';
import { getResolvedApiBaseUrl } from '../../api/axios';

export default function AttendanceList() {
  const { t }   = useTranslation();
  const { user } = useAuth();
  const roleName = typeof user?.role === 'object' ? user?.role?.name : user?.role;
  const canActivateSurprise = ['ADMIN', 'SUPER_ADMIN'].includes(roleName) || user?.is_super_admin;
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage]       = useState(1);
  const [totalPages, setTP]   = useState(1);
  const [dateFilter, setDate] = useState('');
  const [showLateRecords, setShowLateRecords] = useState(false);
  const [showSurpriseModal, setShowSurpriseModal] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState(15);
  const [surpriseSubmitting, setSurpriseSubmitting] = useState(false);
  const [surpriseMsg, setSurpriseMsg] = useState('');
  const [activeSurprise, setActiveSurprise] = useState(null);
  const [activeSurpriseLoading, setActiveSurpriseLoading] = useState(false);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [reviewBusyId, setReviewBusyId] = useState(null);

  const openAttendanceRequestPhoto = useCallback(async (requestId) => {
    const token = localStorage.getItem('access_token');
    const base = getResolvedApiBaseUrl().replace(/\/$/, '');
    const url = `${base}/attendance-requests/${requestId}/photo`;
    try {
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) {
        window.alert(t('attendance_request.photo_unavailable', 'الصورة غير متوفرة أو انتهت صلاحيتها'));
        return;
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const w = window.open(objectUrl, '_blank', 'noopener,noreferrer');
      if (!w) URL.revokeObjectURL(objectUrl);
      else setTimeout(() => URL.revokeObjectURL(objectUrl), 120000);
    } catch {
      window.alert(t('attendance_request.photo_unavailable', 'الصورة غير متوفرة أو انتهت صلاحيتها'));
    }
  }, [t]);

  const refreshActiveSurprise = useCallback(async () => {
    if (!canActivateSurprise) return;
    setActiveSurpriseLoading(true);
    try {
      const { data } = await getActiveSurpriseAttendance();
      setActiveSurprise(data?.data ?? data ?? null);
    } catch {
      setActiveSurprise(null);
    } finally {
      setActiveSurpriseLoading(false);
    }
  }, [canActivateSurprise]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await listAttendance({
        page,
        limit: 10,
        from: dateFilter || undefined,
        to: dateFilter || undefined,
      });
      const inner = data.data;
      setRows(inner?.data || []);
      setTP(inner?.meta?.totalPages || 1);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, dateFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { refreshActiveSurprise(); }, [refreshActiveSurprise]);
  useEffect(() => {
    if (!['ADMIN', 'HR', 'SUPER_ADMIN'].includes(roleName)) return;
    listAttendanceRequests({ page: 1, limit: 10, status: 'PENDING' })
      .then(({ data }) => setPendingRequests(data?.data?.data || []))
      .catch(() => setPendingRequests([]));
  }, [roleName, page, dateFilter]);

  const COLUMNS = [
    {
      key: 'employee', label: t('employee.name'),
      render: (row) => {
        const e = row.employee || row.Employee;
        return (
          <span className="font-medium">
            {e?.first_name} {e?.last_name}
          </span>
        );
      },
    },
    { key: 'work_date', label: t('attendance.date') },
    {
      key: 'check_in',
      label: t('attendance.check_in'),
      render: (row) => (row.check_in ? new Date(row.check_in).toLocaleString() : '—'),
    },
    {
      key: 'check_out',
      label: t('attendance.check_out'),
      render: (row) => (row.check_out ? new Date(row.check_out).toLocaleString() : '—'),
    },
    {
      key: 'total_hours', label: t('attendance.total_hours'),
      render: (row) => row.total_hours != null ? `${row.total_hours.toFixed(1)}h` : '—',
    },
    {
      key: 'late_minutes', label: t('attendance.late_minutes'),
      render: (row) => row.late_minutes > 0
        ? <span className="text-warning font-medium">{row.late_minutes} min</span>
        : <span className="text-gray-400">—</span>,
    },
    {
      key: 'overtime_minutes', label: t('attendance.overtime'),
      render: (row) => row.overtime_minutes > 0
        ? <span className="text-success font-medium">{row.overtime_minutes} min</span>
        : <span className="text-gray-400">—</span>,
    },
    {
      key: 'status', label: t('attendance.status'),
      render: (row) => <Badge status={row.status} label={t(`attendance.${row.status?.toLowerCase()}`)} />,
    },
    {
      key: 'is_surprise',
      label: t('attendance.surprise_fingerprint', 'بصمة مفاجئة'),
      render: (row) => {
        if (Number(row.is_surprise) !== 1) {
          return <span className="text-gray-400">—</span>;
        }
        const se = row.surprise_event;
        const tip = se?.starts_at && se?.ends_at
          ? `${new Date(se.starts_at).toLocaleString()} – ${new Date(se.ends_at).toLocaleString()}`
          : '';
        return (
          <div
            className="rounded-lg border border-pink-200 bg-pink-50/90 px-2 py-1.5 max-w-[220px]"
            title={tip || undefined}
            dir="auto"
          >
            <div className="flex flex-col gap-0.5">
              <Badge variant="warning" label={t('attendance.surprise_yes', 'نعم')} />
              {se?.starts_at && se?.ends_at && (
                <span className="text-[11px] text-pink-900/90 leading-snug">
                  {t('attendance.surprise_window', 'فترة الإعلان')}:{' '}
                  {new Date(se.starts_at).toLocaleString()} – {new Date(se.ends_at).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        );
      },
    },
  ];

  const isLateOrDelayed = (row) => (
    row?.status === 'LATE' || Number(row?.late_minutes || 0) > 0
  );
  const hiddenLateCount = rows.filter(isLateOrDelayed).length;
  const visibleRows = showLateRecords ? rows : rows.filter((r) => !isLateOrDelayed(r));

  const handleActivateSurprise = async () => {
    setSurpriseMsg('');
    setSurpriseSubmitting(true);
    try {
      await activateSurpriseAttendance({
        duration_minutes: Number(durationMinutes || 15),
        title: 'بصمة مفاجئة',
        message: `تم تفعيل بصمة مفاجئة لمدة ${durationMinutes} دقيقة، الرجاء البصمة فوراً.`,
      });
      setSurpriseMsg(t('attendance.surprise_activated', 'تم تفعيل البصمة المفاجئة بنجاح'));
      setShowSurpriseModal(false);
      await refreshActiveSurprise();
    } catch (e) {
      setSurpriseMsg(e.response?.data?.error || e.response?.data?.message || 'Error');
    } finally {
      setSurpriseSubmitting(false);
    }
  };

  const handleCancelSurprise = async () => {
    setSurpriseMsg('');
    setSurpriseSubmitting(true);
    try {
      await cancelSurpriseAttendance();
      setSurpriseMsg(t('attendance.surprise_cancelled', 'تم إلغاء البصمة المفاجئة'));
      await refreshActiveSurprise();
    } catch (e) {
      setSurpriseMsg(e.response?.data?.error || e.response?.data?.message || 'Error');
    } finally {
      setSurpriseSubmitting(false);
    }
  };

  const handleReviewRequest = async (id, status) => {
    const confirmMsg = status === 'APPROVED'
      ? t('attendance_request.confirm_approve', 'تأكيد الموافقة على هذا الطلب؟')
      : t('attendance_request.confirm_reject', 'تأكيد رفض هذا الطلب؟');
    if (!window.confirm(confirmMsg)) return;

    setReviewBusyId(id);
    try {
      await reviewAttendanceRequest(id, { status });
      setPendingRequests((prev) => prev.filter((x) => x.id !== id));
      setSurpriseMsg(status === 'APPROVED'
        ? t('attendance_request.approved', 'تمت الموافقة على الطلب')
        : t('attendance_request.rejected', 'تم رفض الطلب'));
      await fetchData();
    } catch (e) {
      setSurpriseMsg(e.response?.data?.error || e.response?.data?.message || 'Error');
    } finally {
      setReviewBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {surpriseMsg && (
        <div className="rounded-lg border border-pink-200 bg-pink-50 px-4 py-2 text-sm text-pink-700">
          {surpriseMsg}
        </div>
      )}
      <div className="md-card" style={{ overflow: 'visible' }}>
        <div
          className="rounded-xl mx-4 -mt-4 p-4 shadow-card-lg mb-4
                     flex flex-wrap items-center justify-between gap-3"
          style={{ background: 'linear-gradient(195deg, #26c6da, #0097a7)' }}
        >
          <div>
            <h2 className="text-white font-semibold">{t('attendance.title')}</h2>
          </div>
          <div className="flex gap-3 flex-wrap">
            {canActivateSurprise && (
              <>
                <button
                  type="button"
                  onClick={() => setShowSurpriseModal(true)}
                  className="btn-primary text-xs"
                  disabled={surpriseSubmitting || activeSurpriseLoading}
                >
                  <span className="material-icons-round text-base">warning</span>
                  {t('attendance.activate_surprise', 'تفعيل بصمة مفاجئة')}
                </button>
                {activeSurprise?.id && (
                  <button
                    type="button"
                    onClick={handleCancelSurprise}
                    className="btn-ghost text-xs bg-white/15 text-white border border-white/30 hover:bg-white/25"
                    disabled={surpriseSubmitting || activeSurpriseLoading}
                  >
                    <span className="material-icons-round text-base">cancel</span>
                    {t('attendance.cancel_surprise', 'إلغاء البصمة المفاجئة')}
                  </button>
                )}
              </>
            )}
            <button
              type="button"
              onClick={() => setShowLateRecords((v) => !v)}
              className="btn-ghost text-xs"
            >
              <span className="material-icons-round text-base">
                {showLateRecords ? 'visibility_off' : 'visibility'}
              </span>
              {showLateRecords
                ? t('attendance.hide_late_records', 'إخفاء المتأخرين')
                : t('attendance.show_late_records', 'إظهار المتأخرين')}
              {!showLateRecords && hiddenLateCount > 0 ? ` (${hiddenLateCount})` : ''}
            </button>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => { setDate(e.target.value); setPage(1); }}
              className="input w-auto py-1.5 text-sm"
            />
          </div>
        </div>

        <Table
          columns={COLUMNS}
          rows={visibleRows}
          loading={loading}
          page={page}
          totalPages={totalPages}
          onPage={setPage}
        />
      </div>

      {['ADMIN', 'HR', 'SUPER_ADMIN'].includes(roleName) && (
        <div className="md-card p-4">
          <h3 className="font-semibold text-gray-700 mb-3">{t('attendance_request.pending_title', 'طلبات حضور بانتظار الموافقة')}</h3>
          {pendingRequests.length === 0 ? (
            <p className="text-sm text-gray-400">{t('common.no_data')}</p>
          ) : (
            <div className="space-y-2">
              {pendingRequests.map((r) => (
                <div key={r.id} className="rounded-lg border border-gray-100 p-3 bg-gray-50 flex flex-wrap items-center gap-3 justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">
                      {(r.employee?.first_name || '')} {(r.employee?.last_name || '')} · {r.employee?.employee_number || '—'}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {r.request_type === 'CHECK_IN' ? t('attendance_request.check_in', 'طلب دخول') : t('attendance_request.check_out', 'طلب خروج')}
                      {' · '}
                      {r.work_date}
                      {' · '}
                      GPS: {Number(r.gps_latitude).toFixed(6)}, {Number(r.gps_longitude).toFixed(6)} ({Math.round(Number(r.gps_accuracy_m || 0))}m)
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={`https://www.google.com/maps?q=${Number(r.gps_latitude)},${Number(r.gps_longitude)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-ghost text-xs"
                    >
                      <span className="material-icons-round text-base">map</span>
                      {t('attendance_request.show_on_map', 'إظهار على الخارطة')}
                    </a>
                    {(Number(r.has_photo) === 1 || r.photo_path) ? (
                      <button
                        type="button"
                        className="btn-ghost text-xs"
                        onClick={() => openAttendanceRequestPhoto(r.id)}
                      >
                        <span className="material-icons-round text-base">image</span>
                        {t('attendance_request.view_photo', 'عرض الصورة')}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn-primary text-xs"
                      disabled={reviewBusyId === r.id}
                      onClick={() => handleReviewRequest(r.id, 'APPROVED')}
                    >
                      {t('common.approve', 'موافقة')}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost text-xs text-red-700"
                      disabled={reviewBusyId === r.id}
                      onClick={() => handleReviewRequest(r.id, 'REJECTED')}
                    >
                      {t('common.reject', 'رفض')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showSurpriseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-card-lg">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">
              {t('attendance.activate_surprise', 'تفعيل بصمة مفاجئة')}
            </h3>
            <label className="label">
              {t('attendance.duration_minutes', 'المدة بالدقائق')}
            </label>
            <input
              type="number"
              min="1"
              max="240"
              className="input"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setShowSurpriseModal(false)}>
                {t('common.cancel')}
              </button>
              <button type="button" className="btn-primary" disabled={surpriseSubmitting} onClick={handleActivateSurprise}>
                {surpriseSubmitting ? t('common.loading', '...') : t('common.confirm', 'تأكيد')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

