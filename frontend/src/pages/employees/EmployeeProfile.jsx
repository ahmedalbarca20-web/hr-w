import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { getMyEmployee } from '../../api/employee.api';
import { listLeaveBalances, listLeaveRequests } from '../../api/leave.api';
import { listAttendance, createAttendanceRequest, listAttendanceRequests } from '../../api/attendance.api';
import { listAnnouncements } from '../../api/announcement.api';
import Alert from '../../components/common/Alert';
import { useCurrency } from '../../context/CurrencyContext';
import { toErrorString } from '../../utils/helpers';

function InfoRow({ label, value }) {
  const display =
    value == null || value === ''
      ? '—'
      : typeof value === 'object'
        ? toErrorString(value.name ?? value.name_ar ?? value, '—')
        : String(value);
  return (
    <div className="flex justify-between py-2 border-b last:border-0">
      <span className="text-gray-500 text-sm">{label}</span>
      <span className="font-medium text-sm">{display}</span>
    </div>
  );
}

function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function parseJsonArray(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const p = JSON.parse(val);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function compressImageForAttendance(file) {
  if (!(file instanceof File) || !file.type.startsWith('image/')) return file;
  const bitmap = await createImageBitmap(file);
  const maxSide = 1280;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.68);
  });
  if (!blob) return file;
  const compressed = new File([blob], `attreq_${Date.now()}.jpg`, { type: 'image/jpeg' });
  return compressed.size < file.size ? compressed : file;
}

const STATUS_COLOR = { ACTIVE: 'green', INACTIVE: 'gray', TERMINATED: 'red' };
const STATUS_CLASS = {
  green: 'bg-green-100 text-green-700',
  gray: 'bg-gray-100 text-gray-700',
  red: 'bg-red-100 text-red-700',
  yellow: 'bg-yellow-100 text-yellow-700',
};

export default function EmployeeProfile() {
  const { t, i18n } = useTranslation();
  const { user, hasFeature } = useAuth();
  const { fmt } = useCurrency();

  const [emp, setEmp] = useState(null);
  const [balances, setBalances] = useState([]);
  const [requests, setRequests] = useState([]);
  const [attRows, setAttRows] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [attRequests, setAttRequests] = useState([]);
  const [gps, setGps] = useState(null);
  const [requestType, setRequestType] = useState('CHECK_IN');
  const [requestPhoto, setRequestPhoto] = useState(null);
  const [requestNote, setRequestNote] = useState('');
  const [requestBusy, setRequestBusy] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);

  const showLeaves = hasFeature('leaves');
  const showAttendance = hasFeature('attendance');
  const showAnnouncements = hasFeature('announcements');
  const showPayroll = hasFeature('payroll');

  const shift = emp?.shift;
  const workDays = useMemo(() => parseJsonArray(shift?.work_days), [shift?.work_days]);
  const holidays = useMemo(() => parseJsonArray(shift?.holidays), [shift?.holidays]);
  const weekStartLabel = shift?.week_starts_on != null
    ? t(`shift.day_${shift.week_starts_on}`, { defaultValue: String(shift.week_starts_on) })
    : '—';

  useEffect(() => {
    if (!user?.employee_id) {
      setLoading(false);
      return;
    }

    const reqs = [
      getMyEmployee().then((r) => setEmp(r.data?.data)),
    ];

    if (showLeaves) {
      reqs.push(
        listLeaveBalances({ employee_id: user.employee_id }).then((r) => {
          const raw = r.data?.data;
          setBalances(Array.isArray(raw) ? raw : []);
        }),
        listLeaveRequests({ limit: 5 }).then((r) => {
          const inner = r.data?.data;
          setRequests(inner?.data || []);
        }),
      );
    }

    if (showAttendance) {
      reqs.push(
        listAttendance({ page: 1, limit: 14 }).then((r) => {
          const inner = r.data?.data;
          setAttRows(inner?.data || []);
        }),
        listAttendanceRequests({ page: 1, limit: 6 }).then((r) => {
          const inner = r.data?.data;
          setAttRequests(inner?.data || []);
        }),
      );
    }

    if (showAnnouncements) {
      reqs.push(
        listAnnouncements({ page: 1, limit: 5 }).then((r) => {
          const inner = r.data?.data;
          setAnnouncements(inner?.data || []);
        }),
      );
    }

    Promise.all(reqs)
      .catch((e) => setAlert({ type: 'danger', message: e.response?.data?.error || e.response?.data?.message || 'Failed to load profile' }))
      .finally(() => setLoading(false));
  }, [user?.employee_id, showLeaves, showAttendance, showAnnouncements]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400">
        <span className="material-icons-round animate-spin text-4xl">sync</span>
      </div>
    );
  }

  if (!user?.employee_id) {
    return (
      <div className="md-card p-12 text-center text-gray-400">
        <span className="material-icons-round text-6xl mb-3 block">manage_accounts</span>
        <p>{t('profile.no_employee_linked', 'No employee record is linked to your account.')}</p>
      </div>
    );
  }

  const statusColor = STATUS_COLOR[emp?.status] || 'gray';
  const dept = emp?.department;
  const deptName = i18n.language?.startsWith('ar') ? (dept?.name_ar || dept?.name) : (dept?.name || dept?.name_ar);

  const mapGeoError = (err) => {
    const code = Number(err?.code);
    if (code === 1) return t('attendance_request.gps_denied', 'تم رفض صلاحية الموقع. اسمح للموقع من إعدادات المتصفح.');
    if (code === 2) return t('attendance_request.gps_unavailable', 'خدمة الموقع غير متاحة حالياً على الجهاز.');
    if (code === 3) return t('attendance_request.gps_timeout', 'انتهت مهلة تحديد الموقع. جرّب مرة ثانية بمكان مكشوف.');
    return t('attendance_request.gps_failed', 'تعذّر تحديد موقع GPS');
  };

  const getGpsWithOptions = (options) => new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        acc: pos.coords.accuracy,
      }),
      reject,
      options,
    );
  });

  const getGpsNow = async () => {
    if (!window.isSecureContext) {
      throw new Error(t('attendance_request.gps_secure_context', 'GPS يحتاج رابط آمن HTTPS أو localhost.'));
    }
    if (!navigator.geolocation) {
      throw new Error(t('attendance_request.gps_unsupported', 'المتصفح لا يدعم GPS'));
    }

    try {
      // Try strict GPS first.
      return await getGpsWithOptions({ enableHighAccuracy: true, timeout: 18000, maximumAge: 0 });
    } catch (err1) {
      try {
        // Fallback: allow cached/network-assisted location if strict GPS fails.
        return await getGpsWithOptions({ enableHighAccuracy: false, timeout: 12000, maximumAge: 120000 });
      } catch (err2) {
        throw new Error(mapGeoError(err2 || err1));
      }
    }
  };

  const detectGpsNow = async () => {
    if (gpsBusy) return;
    setGpsBusy(true);
    setAlert({
      type: 'success',
      message: t('attendance_request.gps_detecting', 'جاري محاولة تحديد موقع GPS...'),
    });
    try {
      const loc = await getGpsNow();
      setGps(loc);
      setAlert({
        type: 'success',
        message: t('attendance_request.gps_ok', 'تم تحديد موقع GPS بنجاح'),
      });
    } catch (e) {
      setAlert({ type: 'danger', message: e.message || t('attendance_request.gps_failed', 'تعذّر تحديد موقع GPS') });
    } finally {
      setGpsBusy(false);
    }
  };

  const submitAttendanceRequest = async () => {
    if (!requestPhoto) {
      setAlert({ type: 'danger', message: t('attendance_request.photo_required', 'الصورة مطلوبة') });
      return;
    }
    if (!gps) {
      setAlert({ type: 'danger', message: t('attendance_request.gps_required', 'حدد موقع GPS أولاً') });
      return;
    }
    setRequestBusy(true);
    try {
      const form = new FormData();
      form.append('request_type', requestType);
      form.append('gps_latitude', String(gps.lat));
      form.append('gps_longitude', String(gps.lng));
      form.append('gps_accuracy_m', String(gps.acc || 0));
      if (requestNote.trim()) form.append('note', requestNote.trim());
      form.append('photo', requestPhoto);
      await createAttendanceRequest(form);
      const { data } = await listAttendanceRequests({ page: 1, limit: 6 });
      setAttRequests(data?.data?.data || []);
      setRequestPhoto(null);
      setRequestNote('');
      setGps(null);
      setAlert({ type: 'success', message: t('attendance_request.submitted', 'تم إرسال طلب الحضور للموافقة') });
    } catch (e) {
      setAlert({ type: 'danger', message: e.response?.data?.error || e.message || 'Error' });
    } finally {
      setRequestBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}

      <div className="md-card" style={{ overflow: 'visible' }}>
        <div
          className="rounded-xl mx-4 -mt-4 p-5 shadow-card-lg mb-4"
          style={{ background: 'linear-gradient(195deg, #ab47bc, #7b1fa2)' }}
        >
          <div className="flex flex-wrap items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <span className="material-icons-round text-white text-4xl">person</span>
            </div>
            <div className="text-white flex-1 min-w-0">
              <h2 className="text-xl font-bold truncate">{emp?.first_name} {emp?.last_name}</h2>
              <p className="text-white/75 text-sm">
                {emp?.position_id ? `${t('employee.position', 'Position')} #${emp.position_id}` : '—'}
              </p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_CLASS[statusColor] || STATUS_CLASS.gray}`}>
              {emp?.status}
            </span>
          </div>
        </div>

        <div className="px-6 pb-6 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h3 className="font-semibold text-gray-700 mb-3">{t('profile.personal_info', 'Personal Info')}</h3>
            <InfoRow label={t('employee.code', 'Code')} value={emp?.employee_number} />
            <InfoRow label={t('employee.biometric_code', 'Device / biometric ID')} value={emp?.employee_number} />
            <InfoRow label={t('employee.department', 'Department')} value={deptName} />
            <InfoRow label={t('employee.hire_date', 'Hire Date')} value={emp?.hire_date} />
            <InfoRow label={t('employee.contract_type', 'Contract')} value={emp?.contract_type} />
            <InfoRow
              label={t('employee.base_salary', 'Base Salary')}
              value={emp?.base_salary != null ? fmt(emp.base_salary) : '—'}
            />
          </div>

          <div>
            <h3 className="font-semibold text-gray-700 mb-3">{t('profile.contact_info', 'Contact Info')}</h3>
            <InfoRow label={t('employee.phone', 'Phone')} value={emp?.phone} />
            <InfoRow label={t('employee.email', 'Email')} value={emp?.email} />
            <InfoRow label={t('employee.national_id', 'National ID')} value={emp?.national_id} />
            <InfoRow label={t('employee.nationality', 'Nationality')} value={emp?.nationality} />
            <InfoRow label={t('employee.gender', 'Gender')} value={emp?.gender} />
          </div>
        </div>
      </div>

      {showPayroll && (
        <div className="md-card p-6">
          <h3 className="font-semibold text-gray-700">{t('profile.payroll_section', 'Payroll')}</h3>
          <p className="text-sm text-gray-500 mt-1">
            {t('profile.payroll_hint', 'Your salary details are shown in your profile only.')}
          </p>
          <div className="mt-4 rounded-lg border border-orange-100 bg-orange-50 px-4 py-3">
            <p className="text-xs text-gray-500">{t('employee.base_salary', 'Base Salary')}</p>
            <p className="text-lg font-semibold text-orange-700">
              {emp?.base_salary != null ? fmt(emp.base_salary) : '—'}
            </p>
          </div>
        </div>
      )}

      {shift && (
        <div className="md-card p-6">
          <h3 className="font-semibold text-gray-700 mb-4">{t('profile.my_shift', 'My work shift')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <InfoRow label={t('shift.name', 'Shift')} value={i18n.language?.startsWith('ar') ? (shift.name_ar || shift.name) : shift.name} />
            <InfoRow label={t('shift.shift_start', 'Start')} value={shift.shift_start?.slice?.(0, 5) || shift.shift_start} />
            <InfoRow label={t('shift.shift_end', 'End')} value={shift.shift_end?.slice?.(0, 5) || shift.shift_end} />
            <InfoRow label={t('shift.break_start', 'Break start')} value={shift.break_start ? (shift.break_start.slice?.(0, 5) || shift.break_start) : '—'} />
            <InfoRow label={t('shift.break_end', 'Break end')} value={shift.break_end ? (shift.break_end.slice?.(0, 5) || shift.break_end) : '—'} />
            <InfoRow label={t('shift.standard_hours', 'Standard hours')} value={shift.standard_hours} />
            <InfoRow label={t('shift.grace_minutes', 'Grace (min)')} value={shift.grace_minutes} />
            <InfoRow label={t('shift.week_starts_on', 'Week starts on')} value={weekStartLabel} />
          </div>
          <div className="mt-4">
            <p className="text-xs text-gray-500 mb-2">{t('shift.work_days', 'Work days')}</p>
            <div className="flex flex-wrap gap-2">
              {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                <span
                  key={d}
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    workDays.includes(d) ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {t(`shift.day_${d}`)}
                </span>
              ))}
            </div>
          </div>
          {holidays.length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-gray-500 mb-1">{t('shift.holidays', 'Holidays')}</p>
              <ul className="text-sm text-gray-700 list-disc list-inside space-y-1">
                {holidays.map((h, i) => (
                  <li key={i}>{typeof h === 'string' ? h : JSON.stringify(h)}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {showAttendance && (
        <div className="md-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="font-semibold text-gray-700">{t('profile.my_attendance', 'My attendance')}</h3>
            <Link to="/attendance" className="text-sm text-purple-700 hover:underline font-medium">
              {t('profile.view_full_attendance', 'Full attendance page')}
            </Link>
          </div>
          {attRows.length === 0 ? (
            <p className="text-gray-400 text-sm">{t('common.no_data', 'No data')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-2 pr-3">{t('attendance.date')}</th>
                    <th className="py-2 pr-3">{t('attendance.check_in')}</th>
                    <th className="py-2 pr-3">{t('attendance.check_out')}</th>
                    <th className="py-2 pr-3">{t('attendance.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {attRows.map((row) => (
                    <tr key={row.id} className="border-b border-gray-50">
                      <td className="py-2 pr-3">{row.work_date}</td>
                      <td className="py-2 pr-3">{fmtTime(row.check_in)}</td>
                      <td className="py-2 pr-3">{fmtTime(row.check_out)}</td>
                      <td className="py-2 pr-3 font-medium">{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-6 rounded-xl border border-purple-100 bg-purple-50/50 p-4">
            <h4 className="font-semibold text-gray-700 mb-2">{t('attendance_request.title', 'طلب حضور عبر الهاتف (GPS + صورة)')}</h4>
            <p className="text-xs text-gray-500 mb-3">
              {t('attendance_request.hint', 'الطلب يتطلب GPS فعلي وصورة، ثم يُرسل لموافقة الإدارة. لا يمكن إدخال موقع يدوي.')}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select className="input" value={requestType} onChange={(e) => setRequestType(e.target.value)}>
                <option value="CHECK_IN">{t('attendance_request.check_in', 'طلب دخول')}</option>
                <option value="CHECK_OUT">{t('attendance_request.check_out', 'طلب خروج')}</option>
              </select>
              <input
                className="input"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={async (e) => {
                  const picked = e.target.files?.[0] || null;
                  if (!picked) {
                    setRequestPhoto(null);
                    return;
                  }
                  try {
                    const compressed = await compressImageForAttendance(picked);
                    setRequestPhoto(compressed);
                  } catch {
                    setRequestPhoto(picked);
                  }
                }}
              />
              {requestPhoto ? (
                <p className="text-xs text-gray-500 sm:col-span-2">
                  {t('attendance_request.photo_selected', 'الصورة المختارة')}: {requestPhoto.name}
                </p>
              ) : (
                <p className="text-xs text-gray-500 sm:col-span-2">
                  {t('attendance_request.photo_hint', 'التقاط الصورة يتم مباشرة من الكاميرا فقط')}
                </p>
              )}
              <textarea
                className="input sm:col-span-2 min-h-[80px]"
                placeholder={t('attendance_request.note_optional', 'ملاحظة (اختياري)')}
                value={requestNote}
                onChange={(e) => setRequestNote(e.target.value)}
              />
            </div>
            <div
              className="mt-3 flex items-center gap-3"
              style={{ position: 'relative', zIndex: 5, pointerEvents: 'auto' }}
            >
              <button
                type="button"
                className="btn-ghost text-xs"
                onClick={detectGpsNow}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  detectGpsNow();
                }}
              >
                <span className={`material-icons-round text-base ${gpsBusy ? 'animate-spin' : ''}`}>
                  {gps ? 'my_location' : 'location_searching'}
                </span>
                {gps
                  ? t('attendance_request.gps_refresh', 'تحديث GPS')
                  : t('attendance_request.gps_pick', 'تحديد GPS الآن')}
              </button>
              <button
                type="button"
                className="btn-primary text-xs"
                onClick={submitAttendanceRequest}
                disabled={requestBusy || gpsBusy}
              >
                <span className={`material-icons-round text-base ${requestBusy ? 'animate-spin' : ''}`}>send</span>
                {t('attendance_request.submit', 'إرسال الطلب')}
              </button>
              {gps ? (
                <span className="text-xs text-gray-500">
                  GPS: {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)} ({Math.round(gps.acc || 0)}m)
                </span>
              ) : null}
            </div>
          </div>

          {attRequests.length > 0 && (
            <div className="mt-4">
              <h4 className="font-semibold text-gray-700 mb-2">{t('attendance_request.my_recent', 'آخر طلباتي')}</h4>
              <div className="space-y-2">
                {attRequests.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                    <span>{r.request_type === 'CHECK_IN' ? t('attendance_request.check_in', 'طلب دخول') : t('attendance_request.check_out', 'طلب خروج')} · {r.work_date}</span>
                    <span className="font-medium">{r.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showAnnouncements && announcements.length > 0 && (
        <div className="md-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="font-semibold text-gray-700">{t('profile.announcements', 'Announcements')}</h3>
            <Link to="/announcements" className="text-sm text-purple-700 hover:underline font-medium">
              {t('profile.all_announcements', 'All announcements')}
            </Link>
          </div>
          <ul className="space-y-3">
            {announcements.map((a) => (
              <li key={a.id} className="p-3 bg-gray-50 rounded-lg">
                <p className="font-medium text-sm">{i18n.language?.startsWith('ar') ? (a.title_ar || a.title) : a.title}</p>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{i18n.language?.startsWith('ar') ? (a.body_ar || a.body) : a.body}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showLeaves && (
        <>
          <div className="md-card p-6">
            <h3 className="font-semibold text-gray-700 mb-4">{t('leave.balances', 'Leave Balances')}</h3>
            {balances.length === 0 ? (
              <p className="text-gray-400 text-sm">{t('common.no_data', 'No balances found')}</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {balances.map((b) => (
                  <div key={b.id} className="bg-purple-50 rounded-xl p-4 text-center">
                    <p className="text-xs text-gray-500 mb-1">{b.leaveType?.name || b.LeaveType?.name || `Type ${b.leave_type_id}`}</p>
                    <p className="text-2xl font-bold text-purple-700">
                      {b.remaining_days ?? (b.total_days - (b.used_days || 0) - (b.pending_days || 0))}
                    </p>
                    <p className="text-xs text-gray-400">{t('leave.remaining_days', 'remaining days')}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="md-card p-6">
            <h3 className="font-semibold text-gray-700 mb-4">{t('leave.recent_requests', 'Recent Leave Requests')}</h3>
            {requests.length === 0 ? (
              <p className="text-gray-400 text-sm">{t('common.no_data', 'No requests yet')}</p>
            ) : (
              <div className="space-y-2">
                {requests.map((r) => {
                  const color = r.status === 'APPROVED' ? 'green' : r.status === 'REJECTED' ? 'red' : 'yellow';
                  const lt = r.leaveType || r.LeaveType;
                  return (
                    <div key={r.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium">{lt?.name || `Type ${r.leave_type_id}`}</p>
                        <p className="text-xs text-gray-500">
                          {r.start_date} → {r.end_date} · {r.total_days} {t('leave.days', 'days')}
                        </p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_CLASS[color] || STATUS_CLASS.gray}`}>
                        {r.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
