import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../../components/common/Button';
import Alert from '../../components/common/Alert';
import { attendanceReport } from '../../api/report.api';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function formatHours(minutes) {
  if (!minutes && minutes !== 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function AttendanceReport() {
  const { t } = useTranslation();
  const now   = new Date();

  const [year,    setYear]    = useState(now.getFullYear());
  const [month,   setMonth]   = useState(now.getMonth() + 1);
  const [rows,    setRows]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [alert,   setAlert]   = useState(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setAlert(null);
    try {
      const { data } = await attendanceReport({ year, month });
      setRows(data.data?.rows || []);
    } catch (e) {
      setAlert({ type: 'danger', msg: e.response?.data?.error || 'Failed to load report' });
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  const exportCSV = () => {
    if (!rows?.length) return;
    const headers = ['Employee','Code','Department','Present','Absent','Late','Half Day','Leave','Hours','Overtime'];
    const csv = [
      headers.join(','),
      ...rows.map((r) => [
        `"${r.employee_name}"`, r.employee_number, `"${r.department || ''}"`,
        r.present_days || 0, r.absent_days || 0, r.late_days || 0,
        r.half_days || 0, r.leave_days || 0,
        formatHours(r.total_minutes), formatHours(r.overtime_minutes),
      ].join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `attendance-${year}-${String(month).padStart(2, '0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {alert && <Alert type={alert.type} message={alert.msg} onClose={() => setAlert(null)} />}

      <div className="md-card" style={{ overflow: 'visible' }}>
        <div
          className="rounded-xl mx-4 -mt-4 p-4 shadow-card-lg mb-6 flex items-center justify-between gap-3"
          style={{ background: 'linear-gradient(195deg, #00acc1, #006064)' }}
        >
          <h2 className="text-white font-semibold text-lg">
            {t('attendance.report_title', 'Attendance Report')}
          </h2>
        </div>

        {/* Filters */}
        <div className="px-6 pb-4 flex flex-wrap gap-4 items-end">
          <div>
            <label className="label">{t('payroll.year', 'Year')}</label>
            <input
              type="number" className="input w-28" value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label">{t('payroll.month', 'Month')}</label>
            <select className="input" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <Button icon="search" loading={loading} onClick={fetchReport}>
            {t('common.search', 'Search')}
          </Button>
          {rows?.length > 0 && (
            <Button icon="download" variant="outline" onClick={exportCSV}>
              {t('common.export', 'Export CSV')}
            </Button>
          )}
        </div>

        {/* Table */}
        {rows !== null && (
          <div className="overflow-x-auto px-6 pb-6">
            {rows.length === 0 ? (
              <p className="text-gray-500 text-sm py-4">{t('common.no_data', 'No data found')}</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="p-2 font-semibold">{t('employee.name', 'Employee')}</th>
                    <th className="p-2 font-semibold">{t('employee.code', 'Code')}</th>
                    <th className="p-2 font-semibold">{t('employee.department', 'Dept')}</th>
                    <th className="p-2 font-semibold text-green-600">{t('attendance.present', 'Present')}</th>
                    <th className="p-2 font-semibold text-red-500">{t('attendance.absent', 'Absent')}</th>
                    <th className="p-2 font-semibold text-yellow-600">{t('attendance.late', 'Late')}</th>
                    <th className="p-2 font-semibold">{t('attendance.half_day', 'Half')}</th>
                    <th className="p-2 font-semibold text-blue-600">{t('attendance.on_leave', 'Leave')}</th>
                    <th className="p-2 font-semibold">{t('attendance.total_hours', 'Hours')}</th>
                    <th className="p-2 font-semibold text-purple-600">{t('attendance.overtime', 'OT')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.employee_id} className="border-t hover:bg-gray-50">
                      <td className="p-2 font-medium">{r.employee_name}</td>
                      <td className="p-2 font-mono text-xs">{r.employee_number}</td>
                      <td className="p-2 text-gray-600">{r.department || '—'}</td>
                      <td className="p-2 text-green-600 font-semibold">{r.present_days || 0}</td>
                      <td className="p-2 text-red-500">{r.absent_days || 0}</td>
                      <td className="p-2 text-yellow-600">{r.late_days || 0}</td>
                      <td className="p-2">{r.half_days || 0}</td>
                      <td className="p-2 text-blue-600">{r.leave_days || 0}</td>
                      <td className="p-2">{formatHours(r.total_minutes)}</td>
                      <td className="p-2 text-purple-600">{formatHours(r.overtime_minutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

