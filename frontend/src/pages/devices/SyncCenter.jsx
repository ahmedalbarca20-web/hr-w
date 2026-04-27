import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  listDevices,
  testDeviceIngest,
  getDeviceZkUsers,
  importDeviceZkUsers,
  importDeviceZkAttendance,
  readZkFromDevice,
  reResolveLogs,
  setZkDeviceUserPrivilege,
  unlockZkDevice,
} from '../../api/device.api';
import { unwrapZkPayload, zkLiveSummaryLine, zkPrivilegeUi, zkIsDeviceAdminPrivilege } from '../../lib/deviceZk';
import { processAll } from '../../api/process.api';
import { useAuth } from '../../context/AuthContext';

function normalizeZkUserNameKey(name) {
  return String(name ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function ProgressBar({ value, color }) {
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
      <div className="h-1.5 rounded-full transition-all duration-700" style={{ width: `${value}%`, background: color }} />
    </div>
  );
}

export default function SyncCenter() {
  const { t }   = useTranslation();
  const navigate = useNavigate();
  const { hasFeature } = useAuth();
  /** ميزة الشركة `zk_device_pin` (يفعّلها السوبر أدمن) أو حساب سوبر أدمن */
  const canRevealZkPin = hasFeature('zk_device_pin');
  const [devices,  setDevices]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [states,   setStates]   = useState({});   // { id: 'idle'|'syncing'|'done'|'error' }
  const [progress, setProgress] = useState({});
  /** Rows from ZK getUsers() on the opened device */
  const [deviceZkUsers, setDeviceZkUsers] = useState([]);
  const [deviceUsersLoading, setDeviceUsersLoading] = useState(false);
  const [deviceUsersError, setDeviceUsersError] = useState('');
  const [pickerDevice, setPickerDevice] = useState(null);
  const [selectedUids, setSelectedUids] = useState([]);
  const [syncMsg, setSyncMsg] = useState('');
  const [procDate, setProcDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [procDateTo, setProcDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [procLoading, setProcLoading] = useState(false);
  const [pullSubmitting, setPullSubmitting] = useState(false);
  const [zkPrivBusyUid, setZkPrivBusyUid] = useState(null);
  const [zkPrivBulkBusy, setZkPrivBulkBusy] = useState(false);
  const [zkLiveById, setZkLiveById] = useState({});
  const [zkLiveLoading, setZkLiveLoading] = useState(null);
  const [attPullLoading, setAttPullLoading] = useState(null);
  const [attPullAutoProcess, setAttPullAutoProcess] = useState(true);
  /** بعد السحب: استبدال الحضور اليدوي لنفس اليوم بما يطابق البصمات */
  const [attOverwriteManual, setAttOverwriteManual] = useState(true);
  /** في قائمة مستخدمي الجهاز: إخفاء الصفوف ذات الاسم الظاهر المكرر (يبقى أصغر UID) */
  const [hideDupZkNames, setHideDupZkNames] = useState(true);
  /** عند التفعيل: إعادة جلب القائمة مع حقل password من الجهاز، وإرجاعه في نتيجة الاستيراد (لا يُخزَّن في قاعدة الموظفين). */
  const [includeZkPassword, setIncludeZkPassword] = useState(false);

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await listDevices();
      setDevices(data.data?.devices || data.data || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  useEffect(() => {
    if (!canRevealZkPin) setIncludeZkPassword(false);
  }, [canRevealZkPin]);

  const loadDeviceZkUsers = useCallback(async (deviceId, withDevicePassword = false) => {
    setDeviceUsersLoading(true);
    setDeviceUsersError('');
    setDeviceZkUsers([]);
    let rows = [];
    try {
      const { data } = await getDeviceZkUsers(deviceId, { include_password: withDevicePassword });
      const inner = data?.data;
      rows = Array.isArray(inner?.users) ? inner.users : [];
      setDeviceZkUsers(rows);
    } catch (e) {
      setDeviceZkUsers([]);
      setDeviceUsersError(e.response?.data?.error || e.message || 'تعذّر قراءة مستخدمي الجهاز');
    } finally {
      setDeviceUsersLoading(false);
    }
    return rows;
  }, []);

  const zkNameDupCounts = useMemo(() => {
    const m = new Map();
    for (const u of deviceZkUsers) {
      const k = normalizeZkUserNameKey(u.name);
      if (!k) continue;
      m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  }, [deviceZkUsers]);

  const displayZkUsers = useMemo(() => {
    const list = [...deviceZkUsers].sort((a, b) => Number(a.uid) - Number(b.uid));
    if (!hideDupZkNames) return list;
    const seen = new Set();
    return list.filter((u) => {
      const k = normalizeZkUserNameKey(u.name);
      if (!k) return true;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [deviceZkUsers, hideDupZkNames]);

  /** UIDs بصلاحية مدير على الجهاز (بتات P2P1P0 = 3 أو 7، أي البايت الخام غالباً 6 أو 14). */
  const elevatedZkUidList = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const u of deviceZkUsers) {
      if (!zkIsDeviceAdminPrivilege(u.role)) continue;
      const uid = Number(u.uid);
      if (!Number.isInteger(uid) || uid < 1 || seen.has(uid)) continue;
      seen.add(uid);
      out.push(uid);
    }
    return out.sort((a, b) => a - b);
  }, [deviceZkUsers]);

  /** Verifies the same ingestion path as the real device POST /push (HR test log). */
  const syncDevice = async (devId) => {
    const dev = devices.find((d) => d.id === devId);
    if (dev?.status === 'OFFLINE') return;

    setStates((p) => ({ ...p, [devId]: 'syncing' }));
    setProgress((p) => ({ ...p, [devId]: 30 }));
    try {
      const { data: body } = await testDeviceIngest(devId, {});
      const sum = body?.data;
      setSyncMsg(
        `اختبار استقبال: مقبول ${sum?.accepted ?? 0}، مكرر ${sum?.duplicates ?? 0}، غير مطابق لموظف ${sum?.unresolved ?? 0}`,
      );
      setProgress((p) => ({ ...p, [devId]: 100 }));
      setStates((p) => ({ ...p, [devId]: 'done' }));
      await fetchDevices();
    } catch (e) {
      setStates((p) => ({ ...p, [devId]: 'error' }));
      setSyncMsg(e.response?.data?.error || 'فشل اختبار استقبال السجل');
    }
  };

  const runAttendanceProcess = async () => {
    setProcLoading(true);
    setSyncMsg('');
    try {
      await processAll({
        date_from : procDate,
        date_to   : procDateTo,
        overwrite : false,
        dry_run   : false,
      });
      setSyncMsg(`تم تحويل سجلات الأجهزة إلى الحضور للتاريخ ${procDate} (معالجة مجمّعة).`);
    } catch (e) {
      setSyncMsg(e.response?.data?.error || 'تعذّر تشغيل المعالج — تحقق من صلاحية «process» للمستخدم');
    } finally {
      setProcLoading(false);
    }
  };

  const toggleUid = (uid) => {
    const n = Number(uid);
    setSelectedUids((prev) => (
      prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]
    ));
  };

  const openPicker = (device) => {
    setPickerDevice(device);
    setSelectedUids([]);
    setIncludeZkPassword(false);
    setSyncMsg('');
    loadDeviceZkUsers(device.id, false);
  };

  const selectAllDeviceZkUids = () => {
    const all = deviceZkUsers
      .map((u) => Number(u.uid))
      .filter((n) => Number.isInteger(n) && n >= 0);
    setSelectedUids([...new Set(all)]);
  };

  const clearDeviceZkSelection = () => setSelectedUids([]);

  const unlockZkScreenOnly = async () => {
    if (!pickerDevice || zkPrivBusyUid != null || zkPrivBulkBusy) return;
    setZkPrivBulkBusy(true);
    setSyncMsg('');
    try {
      await unlockZkDevice(pickerDevice.id, { socket_timeout_ms: 60000 });
      setSyncMsg('تم إرسال تسلسل فتح الشاشة للجهاز. انتظرُ حتى 15 ثانية على الجهاز ثم جرّب الشاشة.');
      await loadDeviceZkUsers(pickerDevice.id, includeZkPassword);
    } catch (e) {
      setSyncMsg(e.response?.data?.error || e.message || 'تعذّر فك قفل الجهاز — تحقق من الشبكة ومنفذ ZK.');
    } finally {
      setZkPrivBulkBusy(false);
    }
  };

  const clearAllZkElevatedPrivileges = async () => {
    if (!pickerDevice || zkPrivBusyUid != null || zkPrivBulkBusy) return;
    if (elevatedZkUidList.length === 0) {
      setSyncMsg('لا يوجد في القائمة مستخدمون بصلاحية «مدير جهاز» أو «مدير أعلى» (بروتوكول ZK). إن كانت الشاشة مقفولة استخدم «فك قفل الشاشة».');
      return;
    }
    const okConfirm = window.confirm(
      `سيتم أولاً فك قفل الشاشة ثم إلغاء صلاحية المدير عن ${elevatedZkUidList.length} مستخدم (UID: ${elevatedZkUidList.join('، ')}). المتابعة؟`,
    );
    if (!okConfirm) return;
    setZkPrivBulkBusy(true);
    setSyncMsg('');
    try {
      await unlockZkDevice(pickerDevice.id, { socket_timeout_ms: 60000 });
      for (const uid of elevatedZkUidList) {
        await setZkDeviceUserPrivilege(pickerDevice.id, { uid, is_admin: false });
      }
      await unlockZkDevice(pickerDevice.id, { socket_timeout_ms: 60000 });
      setSyncMsg(
        `تم إلغاء صلاحيات المدير عن ${elevatedZkUidList.length} مستخدم(ين) وفُتحت الشاشة بجلسة إضافية. انتظرُ 5–15 ثانية على الجهاز.`,
      );
      await loadDeviceZkUsers(pickerDevice.id, includeZkPassword);
    } catch (e) {
      setSyncMsg(e.response?.data?.error || e.message || 'تعذّر إكمال الإلغاء — تحقق من الاتصال TCP بالجهاز.');
    } finally {
      setZkPrivBulkBusy(false);
    }
  };

  const applyZkDevicePrivilege = async (uid, isAdmin) => {
    if (!pickerDevice || zkPrivBusyUid != null || zkPrivBulkBusy) return;
    setZkPrivBusyUid(uid);
    setSyncMsg('');
    try {
      await setZkDeviceUserPrivilege(pickerDevice.id, { uid, is_admin: isAdmin });
      if (!isAdmin) {
        try {
          await unlockZkDevice(pickerDevice.id, { socket_timeout_ms: 60000 });
        } catch (_) { /* قد يكون الجهاز مفتوحاً بالفعل */ }
      }
      setSyncMsg(
        isAdmin
          ? `تم تفعيل صلاحية مدير الجهاز للمستخدم UID ${uid}.`
          : `تم إلغاء صلاحية المدير — UID ${uid}. أُرسل فتح الشاشة مرة أخرى؛ انتظرُ قليلاً على الجهاز.`,
      );
      await loadDeviceZkUsers(pickerDevice.id, includeZkPassword);
    } catch (e) {
      setSyncMsg(e.response?.data?.error || e.message || 'تعذّر تعديل صلاحية المستخدم على الجهاز');
    } finally {
      setZkPrivBusyUid(null);
    }
  };

  const submitImportFromDevice = async () => {
    if (!pickerDevice || selectedUids.length === 0 || pullSubmitting) return;
    setPullSubmitting(true);
    try {
      const { data: wrap } = await importDeviceZkUsers(pickerDevice.id, {
        uids: selectedUids,
        include_password: includeZkPassword,
      });
      const inner = wrap?.data;
      const n = inner?.imported ?? selectedUids.length;
      const parts = (inner?.results || []).map((r) => {
        let s = `${r.employee_number} (${r.action})`;
        if (r.zk_device_password) s += ` · PIN جهاز: ${r.zk_device_password}`;
        return s;
      }).join('، ');
      setSyncMsg(`تم استيراد ${n} مستخدم من الجهاز «${pickerDevice.name}» إلى الموظفين: ${parts || '—'}`);
      setPickerDevice(null);
      await fetchDevices();
    } catch (e) {
      setSyncMsg(e.response?.data?.error || 'فشل الاستيراد');
    } finally {
      setPullSubmitting(false);
    }
  };

  const syncAll = () => {
    devices.filter((d) => d.status !== 'OFFLINE').forEach((d) => {
      syncDevice(d.id);
    });
  };

  const pullZkLive = async (devId) => {
    if (zkLiveLoading) return;
    setZkLiveLoading(devId);
    setSyncMsg('');
    try {
      const res = await readZkFromDevice(devId, {});
      const z = unwrapZkPayload(res);
      setZkLiveById((p) => ({ ...p, [devId]: zkLiveSummaryLine(z) }));
      setSyncMsg(zkLiveSummaryLine(z));
    } catch (e) {
      const msg = e.response?.data?.error || e.message || 'تعذّر قراءة الجهاز';
      setZkLiveById((p) => ({ ...p, [devId]: msg }));
      setSyncMsg(msg);
    } finally {
      setZkLiveLoading(null);
    }
  };

  /** سحب سجلات البصمة من ذاكرة الجهاز → السجلات الخام، ثم (اختياري) معالجة الحضور */
  const pullZkAttendance = async (devId) => {
    if (attPullLoading) return;
    setAttPullLoading(devId);
    setSyncMsg('');
    try {
      const { data: wrap } = await importDeviceZkAttendance(devId, {
        date_from: procDate,
        date_to: procDateTo,
        auto_process: attPullAutoProcess,
        overwrite_attendance: attOverwriteManual,
        max_records: 12000,
        socket_timeout_ms: 120000,
      });
      const inner = wrap?.data;
      const ing = inner?.ingest;
      const zk = inner?.zk;
      const parts = [
        `سجلات على الجهاز: ${zk?.record_count ?? '—'}`,
        `أُدخلت للمعالجة: ${ing?.total ?? 0}`,
        `مقبول جديد: ${ing?.accepted ?? 0}`,
        `مكرر: ${ing?.duplicates ?? 0}`,
        `بدون مطابقة موظف: ${ing?.unresolved ?? 0}`,
      ];
      if (zk?.capped_to) parts.push(`(حد أقصى ${zk.capped_to} سجل لكل عملية)`);
      const diag = zk?.pull_diagnostics;
      if (diag && ((ing?.total ?? 0) === 0 || (diag.rejected_by_date ?? 0) > 0)) {
        const samples = (diag.sample_dates_outside_range || []).slice(0, 4).join('، ');
        parts.push(
          `تشخيص: منطقة الشركة ${diag.company_timezone} · خام=${diag.records_raw} · صفوف صالحة=${diag.decoded_rows} · خارج نطاق التاريخ=${diag.rejected_by_date}${samples ? ` · أمثلة أيام: ${samples}` : ''}`,
        );
      }
      let tail = '';
      if (inner?.attendance_processing?.results?.length) {
        const ok = inner.attendance_processing.results.filter((r) => r.summary).length;
        tail = ` — معالجة الحضور: ${ok} يوم(أيام) من أصل ${inner.attendance_processing.results.length}`;
      }
      setSyncMsg(`${parts.join(' · ')}${tail}`);
      await fetchDevices();
    } catch (e) {
      const err = e.response?.data;
      const msg = err?.error || err?.message || e.message || 'تعذّر سحب البصمات';
      setSyncMsg(msg);
    } finally {
      setAttPullLoading(null);
    }
  };
  
  const runReResolve = async () => {
    setProcLoading(true);
    setSyncMsg('');
    try {
      const { data: wrap } = await reResolveLogs();
      const res = wrap?.data;
      setSyncMsg(`تمت معالجة ${res?.total || 0} سجل غير معروف، ونجح ربط ${res?.resolved || 0} سجل بأسماء الموظفين.`);
    } catch (e) {
      setSyncMsg(e.response?.data?.error || 'فشل تشغيل عملية الربط المتأخرة');
    } finally {
      setProcLoading(false);
    }
  };

  const activeCount = devices.filter((d) => d.status === 'ACTIVE').length;

  return (
    <div className="space-y-6">
      {syncMsg && (
        <div className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-2 text-sm text-purple-700">
          {syncMsg}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-card p-5 flex flex-col sm:flex-row sm:items-end gap-4 flex-wrap">
        <div className="flex-1 min-w-48">
          <h3 className="text-sm font-bold text-gray-700">تحويل سجلات الأجهزة إلى الحضور</h3>
          <p className="text-xs text-gray-500 mt-1">
            التاريخ أدناه يحدّ يوم سحب البصمات من الجهاز ويُستخدم أيضاً في «معالجة الحضور» (نفس اليوم من بداية لنهاية التقويم حسب توقيت الخادم).
          </p>
          <div className="grid grid-cols-2 gap-4 mt-3">
            <div>
              <label className="label">{t('common.from', 'From')}</label>
              <input
                type="date"
                className="input"
                value={procDate}
                onChange={(e) => setProcDate(e.target.value)}
              />
            </div>
            <div>
              <label className="label">{t('common.to', 'To')}</label>
              <input
                type="date"
                className="input"
                value={procDateTo}
                onChange={(e) => setProcDateTo(e.target.value)}
              />
            </div>
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={attPullAutoProcess}
              onChange={(e) => setAttPullAutoProcess(e.target.checked)}
            />
            بعد السحب: تشغيل معالجة الحضور تلقائياً (يتطلّب تفعيل ميزة «process» للشركة)
          </label>
          <label className="mt-2 flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={attOverwriteManual}
              onChange={(e) => setAttOverwriteManual(e.target.checked)}
              disabled={!attPullAutoProcess}
            />
            استبدال الحضور اليدوي لنفس اليوم بأوقات البصمات من الجهاز (إن وُجد حضور يدوي)
          </label>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" className="btn-primary gap-2" disabled={procLoading} onClick={runAttendanceProcess}>
            {procLoading ? <span className="material-icons-round animate-spin text-base">sync</span> : <span className="material-icons-round text-base">play_arrow</span>}
            معالجة الحضور
          </button>
          <button type="button" className="btn-ghost gap-2 text-sm border border-orange-200 text-orange-700 hover:bg-orange-50" disabled={procLoading} onClick={runReResolve}>
             <span className="material-icons-round text-base">link</span>
             ربط السجلات المفقودة
          </button>
          <button type="button" className="btn-ghost gap-2 text-sm" onClick={() => navigate('/devices/logs')}>
            <span className="material-icons-round text-base">list_alt</span>
            السجلات الخام
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Devices', value: devices.length,  icon: 'router',        color: '#7b1fa2' },
          { label: 'Active',        value: activeCount,     icon: 'check_circle',  color: '#388e3c' },
          { label: 'Offline',       value: devices.filter((d) => d.status === 'OFFLINE').length, icon: 'cancel', color: '#c62828' },
          { label: 'Last Refresh',  value: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), icon: 'schedule', color: '#0097a7' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl shadow-card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: s.color + '18' }}>
              <span className="material-icons-round text-xl" style={{ color: s.color }}>{s.icon}</span>
            </div>
            <div>
              <p className="text-xl font-bold text-gray-800">{loading ? '…' : s.value}</p>
              <p className="text-xs text-gray-400">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Sync panel */}
      <div className="bg-white rounded-xl shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800">{t('device.sync_center', 'Sync Center')}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{devices.length} registered devices</p>
          </div>
          <button onClick={syncAll} className="btn-primary gap-2 text-sm">
            <span className="material-icons-round text-base">sync</span>
            {t('device.sync_all', 'Sync All')}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-24 text-gray-400">
            <span className="material-icons-round animate-spin text-3xl">sync</span>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {devices.map((d) => {
              const state    = states[d.id] || 'idle';
              const pct      = progress[d.id] || 0;
              const isActive = d.status !== 'OFFLINE';

              return (
                <div key={d.id} className="px-5 py-4 flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isActive ? 'bg-brand/8' : 'bg-gray-100'}`}>
                    <span className={`material-icons-round text-xl ${isActive ? 'text-brand' : 'text-gray-300'}`}>router</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-800 text-sm">{d.name}</p>
                      <span className="text-xs text-gray-400 font-mono">{d.ip_address || '—'}</span>
                      {d.status === 'OFFLINE' && (
                        <span className="px-1.5 py-0.5 bg-red-50 text-red-600 rounded text-[10px] font-bold uppercase">Offline</span>
                      )}
                      {d.status === 'INACTIVE' && (
                        <span className="px-1.5 py-0.5 bg-orange-50 text-orange-600 rounded text-[10px] font-bold uppercase">Inactive</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5">
                      {state === 'syncing' ? (
                        <div className="flex-1 max-w-48">
                          <ProgressBar value={pct} color="#9c27b0" />
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400 space-y-0.5">
                          <p>
                            Last sync: {d.last_sync ? new Date(d.last_sync).toLocaleString() : 'Never'}
                          </p>
                          {zkLiveById[d.id] && (
                            <p className="text-violet-700 font-medium break-words">{zkLiveById[d.id]}</p>
                          )}
                        </div>
                      )}
                      {state === 'done' && (
                        <span className="text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <span className="material-icons-round text-sm">check_circle</span>
                          {t('device.sync_done', 'Done')}
                        </span>
                      )}
                      {state === 'syncing' && (
                        <span className="text-xs text-brand font-semibold">{pct}%</span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => syncDevice(d.id)}
                    disabled={!isActive || state === 'syncing'}
                    className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg transition"
                    style={{
                      background: !isActive ? '#f5f5f5' : state === 'done' ? '#e8f5e9' : state === 'error' ? '#ffebee' : '#ab47bc',
                      color:      !isActive ? '#bdbdbd' : state === 'done' ? '#2e7d32' : state === 'error' ? '#c62828' : 'white',
                      cursor:     !isActive ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <span className={`material-icons-round text-base ${state === 'syncing' ? 'animate-spin' : ''}`}>
                      {state === 'done' ? 'check' : state === 'error' ? 'error' : 'verified'}
                    </span>
                    {state === 'syncing' ? 'جاري الاختبار…' : state === 'done' ? 'تم الاختبار' : state === 'error' ? 'فشل' : 'اختبار استقبال'}
                  </button>
                  <button
                    onClick={() => openPicker(d)}
                    disabled={!isActive}
                    className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                  >
                    <span className="material-icons-round text-base">groups</span>
                    {t('device.view_users', 'عرض المستخدمين')}
                  </button>
                  <button
                    type="button"
                    onClick={() => pullZkAttendance(d.id)}
                    disabled={!isActive || attPullLoading === d.id}
                    className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-emerald-200 text-emerald-800 hover:bg-emerald-50 disabled:opacity-40"
                    title={`سحب بصمات يوم ${procDate} من الجهاز إلى السجلات الخام`}
                  >
                    <span className={`material-icons-round text-base ${attPullLoading === d.id ? 'animate-spin' : ''}`}>
                      {attPullLoading === d.id ? 'sync' : 'download'}
                    </span>
                    {t('device.pull_attendance', 'سحب البصمات')}
                  </button>
                  <button
                    type="button"
                    onClick={() => pullZkLive(d.id)}
                    disabled={!isActive || zkLiveLoading === d.id || d.status === 'OFFLINE'}
                    className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-violet-200 text-violet-800 hover:bg-violet-50 disabled:opacity-40"
                    title="قراءة مباشرة من الجهاز (بروتوكول ZK)"
                  >
                    <span className={`material-icons-round text-base ${zkLiveLoading === d.id ? 'animate-spin' : ''}`}>
                      {zkLiveLoading === d.id ? 'sync' : 'fingerprint'}
                    </span>
                    {t('device.from_device', 'من الجهاز')}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {pickerDevice && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-white rounded-xl shadow-card-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-800">
                  مستخدمون على الجهاز — {pickerDevice.name}
                </h3>
                <div className="mt-2 flex flex-wrap items-stretch gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-lg border-2 border-orange-400 bg-orange-50 text-orange-950 hover:bg-orange-100 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                    disabled={
                      deviceUsersLoading
                      || !!deviceUsersError
                      || deviceZkUsers.length === 0
                      || zkPrivBusyUid != null
                      || zkPrivBulkBusy
                    }
                    onClick={clearAllZkElevatedPrivileges}
                    title="يفك قفل الشاشة أولاً ثم يلغي صلاحية المدير/المدير الأعلى (بروتوكول ZK) لكل من في القائمة"
                  >
                    {zkPrivBulkBusy ? (
                      <>
                        <span className="material-icons-round animate-spin text-base">sync</span>
                        جاري فك القفل / إلغاء الصلاحيات…
                      </>
                    ) : (
                      <>
                        <span className="material-icons-round text-base">admin_panel_settings</span>
                        إلغاء صلاحيات المدير (الكل)
                        {elevatedZkUidList.length > 0 && (
                          <span className="font-mono font-normal opacity-90">({elevatedZkUidList.length})</span>
                        )}
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 disabled:opacity-40"
                    disabled={deviceUsersLoading || !!deviceUsersError || zkPrivBusyUid != null || zkPrivBulkBusy}
                    onClick={unlockZkScreenOnly}
                    title="أمر ZK تفعيل الجهاز فقط — إن بقيت الشاشة «مقفولة» بعد سحب بصمات أو إلغاء صلاحيات"
                  >
                    <span className="material-icons-round text-base">lock_open</span>
                    فك قفل الشاشة
                  </button>
                  <p className="text-[10px] text-gray-500 self-center max-w-[200px] leading-snug">
                    زر البرتقالي يفك القفل ثم يلغي صلاحية المدير على الجهاز (البايت 6 أو 14 = مستوى مدير بتنسيق ZK). «فك القفل» لوحده دون تعديل مستخدمين.
                  </p>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  قائمة حقيقية من بروتوكول ZK. عند الاستيراد: يُنشأ موظف جديد أو يُحدَّث الاسم إن وُجد نفس رقم البصمة/البطاقة في النظام.
                  يمكن أيضاً تعديل صلاحية صف واحد من الأزرار على اليمين.
                </p>
                <label className="mt-2 flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hideDupZkNames}
                    onChange={(e) => setHideDupZkNames(e.target.checked)}
                  />
                  إخفاء الاسم المكرر (إظهار أصغر UID فقط لكل اسم متطابق)
                </label>
                {canRevealZkPin ? (
                  <label className="mt-2 flex items-center gap-2 text-xs text-amber-900 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={includeZkPassword}
                      onChange={(e) => {
                        const v = e.target.checked;
                        setIncludeZkPassword(v);
                        if (pickerDevice) loadDeviceZkUsers(pickerDevice.id, v);
                      }}
                    />
                    سحب/عرض رمز الجهاز (PIN) — اختياري؛ لا يُحفظ في ملف الموظف
                  </label>
                ) : (
                  <p className="mt-2 text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 leading-relaxed">
                    إظهار رمز PIN على الجهاز غير مفعّل لشركتك. يفعّله <strong>السوبر أدمن</strong> من شركات النظام ← خصائص العقد ← «عرض رمز جهاز البصمة (PIN)»، ثم أعد تسجيل الدخول أو حدّث الصفحة.
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="text-xs font-semibold px-2 py-1 rounded border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                    disabled={deviceUsersLoading || !!deviceUsersError || deviceZkUsers.length === 0 || zkPrivBulkBusy}
                    onClick={selectAllDeviceZkUids}
                  >
                    تحديد الكل
                  </button>
                  <button
                    type="button"
                    className="text-xs font-semibold px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                    disabled={selectedUids.length === 0 || zkPrivBulkBusy}
                    onClick={clearDeviceZkSelection}
                  >
                    إلغاء التحديد
                  </button>
                </div>
              </div>
              <button type="button" onClick={() => setPickerDevice(null)} className="text-gray-400 hover:text-gray-600">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="max-h-[380px] overflow-auto p-4 space-y-2">
              {deviceUsersLoading && (
                <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
                  <span className="material-icons-round animate-spin">sync</span>
                  <span className="text-sm">جاري قراءة الجهاز…</span>
                </div>
              )}
              {deviceUsersError && !deviceUsersLoading && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{deviceUsersError}</p>
              )}
              {!deviceUsersLoading && !deviceUsersError && displayZkUsers.map((u, idx) => {
                const uid = Number(u.uid);
                const checked = selectedUids.includes(uid);
                const card = u.cardno != null && Number(u.cardno) > 0 ? String(u.cardno) : '—';
                const userId = u.userId != null ? String(u.userId) : '—';
                const nk = normalizeZkUserNameKey(u.name);
                const dupN = nk ? (zkNameDupCounts.get(nk) || 0) : 0;
                const pinDisp = canRevealZkPin && includeZkPassword && u.password != null
                  ? String(u.password).replace(/\0/g, '').trim()
                  : '';
                const priv = zkPrivilegeUi(u);
                const isElevated = zkIsDeviceAdminPrivilege(u.role);
                const isDeviceAdmin = isElevated;
                const isNormalUser = !isElevated;
                const busy = zkPrivBusyUid === uid;
                const rowPrivLocked = zkPrivBulkBusy;
                return (
                  <div
                    key={`${uid}-${idx}`}
                    className="flex flex-wrap sm:flex-nowrap items-center gap-2 p-2 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-100"
                  >
                    <label className="flex items-center gap-2 cursor-pointer flex-shrink-0">
                      <input type="checkbox" checked={checked} onChange={() => toggleUid(uid)} />
                    </label>
                    <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                      <span className="text-sm text-gray-700 font-mono">
                        UID {uid} · معرف {userId} · بطاقة {card}
                      </span>
                      <span className="text-sm text-gray-600 truncate flex items-center gap-2 min-w-0" title={u.name || ''}>
                        <span className="truncate">{u.name || '—'}</span>
                        {dupN > 1 && (
                          <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                            اسم متكرر ({dupN})
                          </span>
                        )}
                        <span
                          className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${priv.cls}`}
                          title={`صلاحية ZK: بايت ${priv.raw} (0x${Number(priv.raw ?? 0).toString(16)}) — مستوى P2P1P0=${priv.level}`}
                        >
                          {priv.text}
                        </span>
                      </span>
                    </div>
                    {canRevealZkPin && includeZkPassword && (
                      <span className="flex-shrink-0 text-xs font-mono text-amber-900 tabular-nums" title="PIN على الجهاز">
                        {pinDisp || '—'}
                      </span>
                    )}
                    <div className="flex flex-wrap gap-1 flex-shrink-0 justify-end">
                      <button
                        type="button"
                        className="text-[10px] font-bold px-2 py-1 rounded border border-violet-200 text-violet-800 hover:bg-violet-50 disabled:opacity-40"
                        disabled={busy || rowPrivLocked || isDeviceAdmin}
                        title="تعيين كمدير أعلى على الجهاز (بروتوكول ZK)"
                        onClick={() => applyZkDevicePrivilege(uid, true)}
                      >
                        {busy ? '…' : 'تفعيل مدير'}
                      </button>
                      <button
                        type="button"
                        className="text-[10px] font-bold px-2 py-1 rounded border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                        disabled={busy || rowPrivLocked || isNormalUser}
                        title="إلغاء صلاحية المدير على الجهاز (مستوى عادي)"
                        onClick={() => applyZkDevicePrivilege(uid, false)}
                      >
                        {busy ? '…' : 'إلغاء مدير'}
                      </button>
                    </div>
                  </div>
                );
              })}
              {!deviceUsersLoading && !deviceUsersError && deviceZkUsers.length === 0 && (
                <p className="text-sm text-gray-500">لا يوجد مستخدمون على الجهاز أو تعذّرت القراءة.</p>
              )}
            </div>
            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
              <button type="button" className="btn-ghost" disabled={zkPrivBulkBusy} onClick={() => setPickerDevice(null)}>إلغاء</button>
              <button
                type="button"
                className="btn-primary"
                disabled={selectedUids.length === 0 || pullSubmitting || zkPrivBulkBusy}
                onClick={submitImportFromDevice}
              >
                {pullSubmitting ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="material-icons-round animate-spin text-base">sync</span>
                    جاري الاستيراد…
                  </span>
                ) : (
                <>{t('device.import_selected_to_employees', 'استيراد المحددين إلى الموظفين')} ({selectedUids.length})</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
