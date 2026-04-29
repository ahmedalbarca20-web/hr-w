import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import StatCard from '../../components/common/StatCard';
import { PageLoader } from '../../components/common/Loader';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import api from '../../api/axios';
import { listDevices, readZkFromDevice, testDeviceIngest } from '../../api/device.api';
import { unwrapZkPayload, zkLiveSummaryLine } from '../../lib/deviceZk';
import { headcountReport, leaveReport, payrollReport } from '../../api/report.api';
import { listAnnouncements } from '../../api/announcement.api';
import { getActiveSurpriseAttendance } from '../../api/attendance.api';
import EmployeeProfile from '../employees/EmployeeProfile';
import {
  getActivityLog,
  onActivityLog,
  formatRelativeTime,
  styleForResource,
  firstResourceSegment,
  describeActivity,
} from '../../utils/activityLog';

/* ── Mock data ──────────────────────────────────────────────────────── */
const MOCK_ATTENDANCE = [
  { day: 'Mon', present: 42, absent: 5 },
  { day: 'Tue', present: 45, absent: 3 },
  { day: 'Wed', present: 38, absent: 9 },
  { day: 'Thu', present: 47, absent: 2 },
  { day: 'Fri', present: 44, absent: 4 },
  { day: 'Sat', present: 20, absent: 0 },
];
const MOCK_DEPT = [
  { name: 'HR',          value: 8 },
  { name: 'Engineering', value: 24 },
  { name: 'Sales',       value: 16 },
  { name: 'Finance',     value: 10 },
  { name: 'Operations',  value: 14 },
];
const MOCK_DEVICES = [
  { id: 1, name: 'Main Gate – Door A',   ip: '192.168.1.101', status: 'online',  last_sync: '2 min ago',  records: 1240 },
  { id: 2, name: 'Office Floor 2',        ip: '192.168.1.102', status: 'online',  last_sync: '5 min ago',  records: 876  },
  { id: 3, name: 'Server Room',           ip: '192.168.1.103', status: 'offline', last_sync: '2 hrs ago',  records: 432  },
  { id: 4, name: 'Parking Entrance',      ip: '192.168.1.104', status: 'online',  last_sync: '1 min ago',  records: 598  },
  { id: 5, name: 'Canteen',               ip: '192.168.1.105', status: 'warning', last_sync: '30 min ago', records: 310  },
];
/* ── Device status badge ─────────────────────────────────────────────── */
const STATUS_STYLE = {
  ACTIVE:   { bg: '#e8f5e9', text: '#2e7d32', dot: '#4caf50', label: 'Active'   },
  INACTIVE: { bg: '#fff3e0', text: '#e65100', dot: '#ff9800', label: 'Inactive' },
  OFFLINE:  { bg: '#ffebee', text: '#c62828', dot: '#f44336', label: 'Offline'  },
  // legacy fallbacks
  online:   { bg: '#e8f5e9', text: '#2e7d32', dot: '#4caf50', label: 'Online'   },
  offline:  { bg: '#ffebee', text: '#c62828', dot: '#f44336', label: 'Offline'  },
  warning:  { bg: '#fff3e0', text: '#e65100', dot: '#ff9800', label: 'Warning'  },
};
function DeviceStatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.offline;
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: s.bg, color: s.text }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.dot }} />
      {s.label}
    </span>
  );
}

/* ── Chart header card ───────────────────────────────────────────────── */
function ChartHeader({ title, gradient }) {
  return (
    <div className="rounded-xl mx-4 -mt-4 p-4 shadow-card-lg mb-4" style={{ background: gradient }}>
      <h3 className="text-white font-semibold text-sm">{title}</h3>
    </div>
  );
}

const QUICK_NAV = [
  { path: '/attendance', icon: 'access_time', titleKey: 'nav.attendance', feature: 'attendance', gradient: 'linear-gradient(135deg,#42424a,#191919)' },
  { path: '/leaves', icon: 'event_note', titleKey: 'nav.leaves', feature: 'leaves', gradient: 'linear-gradient(135deg,#26c6da,#0097a7)' },
  { path: '/payroll', icon: 'payments', titleKey: 'nav.payroll', feature: 'payroll', gradient: 'linear-gradient(135deg,#ffa726,#f57c00)' },
  { path: '/employees', icon: 'group', titleKey: 'nav.employees', feature: 'employees', gradient: 'linear-gradient(135deg,#66bb6a,#388e3c)' },
  { path: '/shifts', icon: 'schedule', titleKey: 'nav.shifts', feature: 'shifts', gradient: 'linear-gradient(135deg,#42a5f5,#1e88e5)' },
  { path: '/devices/sync', icon: 'sync', titleKey: 'nav.devices_sync', feature: 'devices', gradient: 'linear-gradient(135deg,#5e35b1,#311b92)' },
  { path: '/devices/logs', icon: 'receipt_long', titleKey: 'nav.devices_logs', feature: 'devices', gradient: 'linear-gradient(135deg,#ab47bc,#7b1fa2)' },
  { path: '/companies', icon: 'domain', titleKey: 'nav.companies', superAdminOnly: true, gradient: 'linear-gradient(135deg,#5c6bc0,#3949ab)' },
];

function sumNumericField(rows, field) {
  if (!Array.isArray(rows)) return null;
  const n = rows.reduce((s, r) => s + Number(r[field] ?? 0), 0);
  return Number.isFinite(n) ? n : null;
}

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const navigate  = useNavigate();
  const { hasFeature, user } = useAuth();
  const { fmt } = useCurrency();
  const roleName = typeof user?.role === 'object' ? user?.role?.name : user?.role;
  const isSuperAdmin = roleName === 'SUPER_ADMIN' || user?.is_super_admin;
  const isAdminOrHr = ['ADMIN', 'HR', 'SUPER_ADMIN'].includes(roleName) || user?.is_super_admin;
  const [stats,   setStats]   = useState(null);
  const [reportSnap, setReportSnap] = useState(null);
  const [devices, setDevices] = useState(MOCK_DEVICES);
  const [deviceZkNote, setDeviceZkNote] = useState('');
  const [deviceZkBusy, setDeviceZkBusy] = useState(null);
  const [dashIngestBusy, setDashIngestBusy] = useState(null);
  const [dashIngestMsg, setDashIngestMsg] = useState('');
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState(() => getActivityLog());
  const [activeSurprise, setActiveSurprise] = useState(null);
  const lastNotifiedSurpriseId = useRef(null);

  useEffect(() => {
    setActivities(getActivityLog());
    return onActivityLog(() => setActivities(getActivityLog()));
  }, [user?.company_id, user?.is_super_admin, user?.role]);

  useEffect(() => {
    if (!isAdminOrHr) {
      setStats({ total_employees: 0, present_today: 0, on_leave: 0, month_payroll: 0 });
      setLoading(false);
      return;
    }
    api.get('/dashboard/summary')
      .then(({ data }) => setStats(data.data))
      .catch(() => setStats({ total_employees: 0, present_today: 0, on_leave: 0, month_payroll: 0 }))
      .finally(() => setLoading(false));
  }, [isAdminOrHr]);

  const refreshDevices = useCallback(() => {
    if (!isAdminOrHr || !hasFeature('devices')) return Promise.resolve();
    return listDevices()
      .then(({ data }) => {
        const list = data.data?.devices || data.data || [];
        if (list.length > 0) setDevices(list);
      })
      .catch(() => {});
  }, [isAdminOrHr, hasFeature]);

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  useEffect(() => {
    if (!isAdminOrHr || !hasFeature('reports')) {
      setReportSnap(null);
      return;
    }
    const year = new Date().getFullYear();
    Promise.allSettled([
      headcountReport({}),
      leaveReport({ year }),
      payrollReport({ year }),
    ]).then(([hc, lv, pr]) => {
      const hcRows = hc.status === 'fulfilled' ? hc.value?.data?.data?.rows : null;
      const lvRows = lv.status === 'fulfilled' ? lv.value?.data?.data?.rows : null;
      const prRows = pr.status === 'fulfilled' ? pr.value?.data?.data?.rows : null;
      setReportSnap({
        year,
        headcount: sumNumericField(hcRows, 'count'),
        leaveDays: sumNumericField(lvRows, 'approved_days'),
        payrollNet: sumNumericField(prRows, 'total_net'),
      });
    });
  }, [isAdminOrHr, user]);

  const playSurpriseBeep = useCallback(() => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 920;
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
      osc.stop(ctx.currentTime + 0.5);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let timer = null;
    const pull = () => getActiveSurpriseAttendance()
      .then(({ data }) => setActiveSurprise(data?.data || null))
      .catch(() => setActiveSurprise(null));
    pull();
    timer = setInterval(pull, 30000);
    return () => { if (timer) clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!activeSurprise) return;
    const sid = String(activeSurprise.id || activeSurprise.starts_at || '');
    if (!sid || sid === lastNotifiedSurpriseId.current) return;
    lastNotifiedSurpriseId.current = sid;
    playSurpriseBeep();
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(t('attendance.surprise_active', 'بصمة مفاجئة فعالة الآن'), {
          body: activeSurprise.message || t('attendance.surprise_default_msg', 'يرجى التوجه للبصمة خلال الوقت المحدد.'),
        });
      } else if (Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    }
  }, [activeSurprise, playSurpriseBeep, t]);

  useEffect(() => {
    if (!hasFeature('announcements')) {
      setAnnouncements([]);
      return;
    }
    listAnnouncements({ page: 1, limit: 6 })
      .then(({ data }) => {
        const rows = data?.data?.data || [];
        setAnnouncements(Array.isArray(rows) ? rows : []);
      })
      .catch(() => setAnnouncements([]));
  }, [hasFeature]);

  if (loading) return <PageLoader />;

  const onlineDevices  = devices.filter((d) => d.status === 'ACTIVE'  || d.status === 'online').length;
  const offlineDevices = devices.filter((d) => d.status === 'OFFLINE' || d.status === 'offline').length;
  const warnDevices    = devices.filter((d) => d.status === 'INACTIVE' || d.status === 'warning').length;
  const topAnnouncement = announcements.find((a) => a.is_pinned) || announcements[0] || null;

  const pullDashZk = async (devId) => {
    if (deviceZkBusy) return;
    setDeviceZkBusy(devId);
    setDeviceZkNote('');
    try {
      const res = await readZkFromDevice(devId, {});
      setDeviceZkNote(zkLiveSummaryLine(unwrapZkPayload(res)));
    } catch (e) {
      setDeviceZkNote(e.response?.data?.error || e.message || 'تعذّر قراءة الجهاز');
    } finally {
      setDeviceZkBusy(null);
    }
  };

  const isDeviceOffline = (d) => d.status === 'OFFLINE' || d.status === 'offline';

  const runDashIngestOne = async (devId) => {
    const dev = devices.find((d) => d.id === devId);
    if (!dev || isDeviceOffline(dev) || dashIngestBusy) return;
    setDashIngestBusy(devId);
    setDashIngestMsg('');
    try {
      const { data: body } = await testDeviceIngest(devId, {});
      const sum = body?.data;
      setDashIngestMsg(
        `${dev.name}: مقبول ${sum?.accepted ?? 0}، مكرر ${sum?.duplicates ?? 0}، غير مطابق ${sum?.unresolved ?? 0}`,
      );
      await refreshDevices();
    } catch (e) {
      setDashIngestMsg(e.response?.data?.error || `${dev?.name || ''}: فشل اختبار الاستقبال`);
    } finally {
      setDashIngestBusy(null);
    }
  };

  const runDashIngestAll = async () => {
    const targets = devices.filter((d) => !isDeviceOffline(d));
    if (!targets.length || dashIngestBusy) return;
    setDashIngestBusy('all');
    setDashIngestMsg('');
    try {
      const settled = await Promise.allSettled(
        targets.map((d) => testDeviceIngest(d.id, {})),
      );
      let totalAcc = 0;
      const parts = settled.map((r, i) => {
        if (r.status === 'fulfilled') {
          const sum = r.value?.data?.data;
          const acc = Number(sum?.accepted ?? 0);
          if (Number.isFinite(acc)) totalAcc += acc;
          return `${targets[i].name}: ${sum?.accepted ?? 0}`;
        }
        return `${targets[i].name}: فشل`;
      });
      setDashIngestMsg(`مزامنة سريعة — مقبول إجمالي ${totalAcc}. ${parts.join('؛ ')}`);
      await refreshDevices();
    } catch (e) {
      setDashIngestMsg(e.response?.data?.error || 'تعذّر تنفيذ المزامنة');
    } finally {
      setDashIngestBusy(null);
    }
  };

  if (!isAdminOrHr) {
    return (
      <div className="space-y-6">
        {activeSurprise && (
          <div className="rounded-2xl border border-pink-200 bg-pink-100/90 px-5 py-4 shadow-sm">
            <div className="mb-1 flex items-center gap-2 text-red-700">
              <span className="material-icons-round text-xl">notifications_active</span>
              <h3 className="text-base font-bold">{t('attendance.surprise_active', 'بصمة مفاجئة فعالة الآن')}</h3>
            </div>
            <p className="text-sm text-red-700">
              {activeSurprise.message || t('attendance.surprise_default_msg', 'يرجى التوجه للبصمة خلال الوقت المحدد.')}
            </p>
          </div>
        )}
        {hasFeature('announcements') && topAnnouncement && (
          <div className="rounded-2xl border border-pink-200 bg-pink-100/90 px-5 py-4 shadow-sm">
            <div className="mb-1 flex items-center gap-2 text-red-700">
              <span className="material-icons-round text-xl">priority_high</span>
              <h3 className="text-base font-bold">{t('announcement.title')} - {t('common.important', 'Important')}</h3>
            </div>
            <p className="text-base font-bold text-red-700">
              {topAnnouncement.is_pinned ? '📌 ' : ''}
              {i18n.language?.startsWith('ar')
                ? (topAnnouncement.title_ar || topAnnouncement.title)
                : topAnnouncement.title}
            </p>
            <p className="mt-1 text-sm text-red-600">
              {i18n.language?.startsWith('ar')
                ? (topAnnouncement.body_ar || topAnnouncement.body)
                : topAnnouncement.body}
            </p>
          </div>
        )}
        <EmployeeProfile />
      </div>
    );
  }

  return (
    <div className="space-y-7">
      {activeSurprise && (
        <div className="rounded-2xl border border-pink-200 bg-pink-100/90 px-5 py-4 shadow-sm">
          <div className="mb-1 flex items-center gap-2 text-red-700">
            <span className="material-icons-round text-xl">notifications_active</span>
            <h3 className="text-base font-bold">{t('attendance.surprise_active', 'بصمة مفاجئة فعالة الآن')}</h3>
          </div>
          <p className="text-sm text-red-700">
            {activeSurprise.message || t('attendance.surprise_default_msg', 'يرجى التوجه للبصمة خلال الوقت المحدد.')}
          </p>
        </div>
      )}
      {/* ── Top important announcement ───────────────────────────── */}
      {hasFeature('announcements') && topAnnouncement && (
        <div className="rounded-2xl border border-pink-200 bg-pink-100/90 px-5 py-4 shadow-sm">
          <div className="mb-1 flex items-center gap-2 text-red-700">
            <span className="material-icons-round text-xl">priority_high</span>
            <h3 className="text-base font-bold">{t('announcement.title')} - {t('common.important', 'Important')}</h3>
          </div>
          <p className="text-base font-bold text-red-700">
            {topAnnouncement.is_pinned ? '📌 ' : ''}
            {i18n.language?.startsWith('ar')
              ? (topAnnouncement.title_ar || topAnnouncement.title)
              : topAnnouncement.title}
          </p>
          <p className="mt-1 text-sm text-red-600">
            {i18n.language?.startsWith('ar')
              ? (topAnnouncement.body_ar || topAnnouncement.body)
              : topAnnouncement.body}
          </p>
        </div>
      )}

      {/* ── HR Stat cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 pt-2">
        <StatCard icon="group"       color="brand"   label={t('dashboard.total_employees')}    value={stats?.total_employees ?? '—'} footer={t('dashboard.welcome')} />
        <StatCard icon="how_to_reg"  color="success" label={t('dashboard.present_today')}      value={stats?.present_today ?? '—'}   footer={new Date().toLocaleDateString()} />
        <StatCard icon="beach_access" color="info"   label={t('dashboard.on_leave')}           value={stats?.on_leave ?? '—'} />
        <StatCard icon="payments"    color="warning" label={t('dashboard.this_month_payroll')} value={stats?.month_payroll != null ? fmt(stats.month_payroll) : '—'} />
      </div>

      {isAdminOrHr && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {QUICK_NAV.filter((q) => {
            if (q.superAdminOnly && !isSuperAdmin) return false;
            if (q.feature && !hasFeature(q.feature)) return false;
            return true;
          }).map((q) => (
            <button
              key={q.path}
              type="button"
              onClick={() => navigate(q.path)}
              className="rounded-xl p-4 text-left text-white shadow-card hover:shadow-card-lg transition-shadow w-full"
              style={{ background: q.gradient }}
            >
              <span className="material-icons-round text-2xl opacity-90">{q.icon}</span>
              <p className="mt-2 text-sm font-semibold leading-tight">{t(q.titleKey)}</p>
            </button>
          ))}
        </div>
      )}

      {isAdminOrHr && hasFeature('reports') && reportSnap && (
        <div className="md-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h3 className="font-semibold text-gray-800">{t('dashboard.report_snapshot')}</h3>
            <span className="text-xs text-gray-500">{t('dashboard.report_year', { year: reportSnap.year })}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl bg-purple-50/80 border border-purple-100 px-4 py-3">
              <p className="text-xs text-gray-500 mb-1">{t('dashboard.report_headcount')}</p>
              <p className="text-2xl font-bold text-purple-800">{reportSnap.headcount != null ? reportSnap.headcount : '—'}</p>
            </div>
            <div className="rounded-xl bg-cyan-50/80 border border-cyan-100 px-4 py-3">
              <p className="text-xs text-gray-500 mb-1">{t('dashboard.report_leave_days')}</p>
              <p className="text-2xl font-bold text-cyan-800">{reportSnap.leaveDays != null ? reportSnap.leaveDays.toFixed(1) : '—'}</p>
            </div>
            <div className="rounded-xl bg-orange-50/80 border border-orange-100 px-4 py-3">
              <p className="text-xs text-gray-500 mb-1">{t('dashboard.report_payroll_net')}</p>
              <p className="text-2xl font-bold text-orange-800">
                {reportSnap.payrollNet != null ? fmt(reportSnap.payrollNet) : '—'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Device status overview ─────────────────────────────── */}
      {hasFeature('devices') && (
        <div className="md-card" style={{ overflow: 'visible' }}>
          <ChartHeader title={t('dashboard.device_status')} gradient="linear-gradient(195deg, #ab47bc, #7b1fa2)" />

        {(deviceZkNote || dashIngestMsg) && (
          <div className="px-6 pt-2 text-xs text-violet-900 bg-violet-50/90 border-b border-violet-100 py-2 space-y-1">
            {dashIngestMsg && <p>{dashIngestMsg}</p>}
            {deviceZkNote && <p>{deviceZkNote}</p>}
          </div>
        )}

        {/* Summary pills */}
        <div className="px-6 pb-3 flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2 bg-green-50 text-green-700 px-3 py-1.5 rounded-lg text-sm font-semibold">
            <span className="material-icons-round text-base">check_circle</span>
            {onlineDevices} {t('device.online')}
          </div>
          <div className="flex items-center gap-2 bg-red-50 text-red-700 px-3 py-1.5 rounded-lg text-sm font-semibold">
            <span className="material-icons-round text-base">error</span>
            {offlineDevices} {t('device.offline')}
          </div>
          <div className="flex items-center gap-2 bg-orange-50 text-orange-700 px-3 py-1.5 rounded-lg text-sm font-semibold">
            <span className="material-icons-round text-base">warning</span>
            {warnDevices} {t('device.warning')}
          </div>
          <div className="flex-1" />
          <button
            type="button"
            onClick={runDashIngestAll}
            disabled={!!dashIngestBusy || devices.filter((d) => !isDeviceOffline(d)).length === 0}
            className="btn-primary text-xs gap-1"
          >
            <span className={`material-icons-round text-sm ${dashIngestBusy === 'all' ? 'animate-spin' : ''}`}>
              {dashIngestBusy === 'all' ? 'sync' : 'sync'}
            </span>
            {t('device.sync_all', 'مزامنة الكل')}
          </button>
          <button type="button" onClick={() => navigate('/devices/sync')} className="btn-ghost text-xs gap-1">
            <span className="material-icons-round text-sm">hub</span>
            {t('nav.devices_sync')}
          </button>
          <button type="button" onClick={() => navigate('/devices')} className="btn-ghost text-xs gap-1">
            <span className="material-icons-round text-sm">arrow_forward</span>
            {t('device.view_all')}
          </button>
        </div>

        {/* Device table */}
        <div className="overflow-x-auto rounded-b-xl">
          <table className="w-full">
            <thead className="bg-gray-50 border-t border-gray-100">
              <tr>
                <th className="th">{t('device.name')}</th>
                <th className="th hidden md:table-cell">{t('device.ip')}</th>
                <th className="th">{t('device.status')}</th>
                <th className="th hidden lg:table-cell">{t('device.last_sync')}</th>
                <th className="th hidden lg:table-cell">{t('device.records')}</th>
                <th className="th w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {devices.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="td font-medium text-gray-800">
                    <div className="flex items-center gap-2">
                      <span className="material-icons-round text-brand/60 text-base">router</span>
                      {d.name}
                    </div>
                  </td>
                  <td className="td hidden md:table-cell text-gray-400 font-mono text-xs">{d.ip_address || d.ip || '—'}</td>
                  <td className="td"><DeviceStatusBadge status={d.status} /></td>
                  <td className="td hidden lg:table-cell text-gray-400 text-xs">{d.last_sync ? (typeof d.last_sync === 'string' && !d.last_sync.includes('T') ? d.last_sync : new Date(d.last_sync).toLocaleString()) : '—'}</td>
                  <td className="td hidden lg:table-cell">
                    <span className="text-xs font-semibold text-gray-600">{d.records != null ? d.records.toLocaleString() : '—'}</span>
                  </td>
                  <td className="td">
                    <div className="flex items-center gap-0.5 justify-end">
                      <button
                        type="button"
                        onClick={() => pullDashZk(d.id)}
                        disabled={deviceZkBusy === d.id || isDeviceOffline(d)}
                        title="قراءة من الجهاز (ZK)"
                        className="text-violet-700 hover:text-violet-900 p-1 rounded hover:bg-violet-50 transition disabled:opacity-40"
                      >
                        <span className={`material-icons-round text-base ${deviceZkBusy === d.id ? 'animate-spin' : ''}`}>
                          {deviceZkBusy === d.id ? 'sync' : 'fingerprint'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => runDashIngestOne(d.id)}
                        disabled={isDeviceOffline(d) || !!dashIngestBusy}
                        className="text-brand hover:text-brand-700 p-1 rounded hover:bg-brand/5 transition disabled:opacity-40"
                        title={t('device.sync_test', 'اختبار استقبال / مزامنة')}
                      >
                        <span className={`material-icons-round text-base ${dashIngestBusy === d.id ? 'animate-spin' : ''}`}>sync</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      )}

      {/* ── Charts row ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="md-card lg:col-span-2" style={{ overflow: 'visible' }}>
          <ChartHeader title={t('dashboard.attendance_chart')} gradient="linear-gradient(195deg, #42424a, #191919)" />
          <div className="px-4 pb-4">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={stats?.attendance_week || MOCK_ATTENDANCE} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="present" stroke="#4caf50" strokeWidth={2} dot={false} name="Present" />
                <Line type="monotone" dataKey="absent"  stroke="#f44336" strokeWidth={2} dot={false} name="Absent" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="md-card" style={{ overflow: 'visible' }}>
          <ChartHeader title={t('dashboard.dept_dist')} gradient="linear-gradient(195deg, #ec407a, #d81b60)" />
          <div className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stats?.dept_distribution || MOCK_DEPT} layout="vertical" margin={{ left: 0, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#9c27b0" radius={[0, 4, 4, 0]} name="Employees" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── Recent activity (from successful API mutations in this browser) ─ */}
      <div className="md-card" style={{ overflow: 'visible' }}>
        <ChartHeader title={t('dashboard.recent_activity')} gradient="linear-gradient(195deg, #26c6da, #0097a7)" />
        <div className="px-4 pb-6 space-y-3">
          {activities.length === 0 ? (
            <p className="text-sm text-gray-500 leading-relaxed py-2">{t('dashboard.activity_empty')}</p>
          ) : (
            activities.map((item) => {
              const seg = firstResourceSegment(item.path);
              const { icon, color } = styleForResource(seg);
              return (
                <div key={item.id} className="flex items-start gap-3">
                  <span
                    className="material-icons-round flex size-8 flex-shrink-0 items-center justify-center rounded-full text-base"
                    style={{ background: `${color}18`, color }}
                  >
                    {icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug text-gray-800">{describeActivity(item, t)}</p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {formatRelativeTime(item.at, i18n.language)}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-gray-400" title={item.path}>
                      {String(item.method || '').toUpperCase()} {item.path}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

    </div>
  );
}
