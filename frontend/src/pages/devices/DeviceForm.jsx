import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  getDevice,
  createDevice,
  updateDevice,
  probeDeviceViaAgent,
  probeLocalAgent,
  probeDeviceConnection,
  probeZkSocket,
  scanZkRange,
} from '../../api/device.api';
import { listDepartments } from '../../api/department.api';
import { applyZkSnapshotToForm, extractZkSerialFromSnapshot, unwrapZkPayload, zkFailureMessage } from '../../lib/deviceZk';
import { toErrorString } from '../../utils/helpers';

function Field({ label, children, error }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-danger">{toErrorString(error, '')}</p>}
    </div>
  );
}

export default function DeviceForm() {
  const { t }    = useTranslation();
  const navigate = useNavigate();
  const { id }   = useParams();
  const isEdit   = !!id;
  const DEFAULT_DEVICE_IP = '192.168.0.201';
  const makeFallbackSerial = (ip) => {
    const clean = String(ip || '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
    return `AUTO-${clean || 'DEVICE'}`;
  };

  const EMPTY = {
    name: '',
    ip_address: DEFAULT_DEVICE_IP,
    port: '4370',
    comm_key: '',
    type: 'FINGERPRINT',
    serial_number: '',
    location: '',
    firmware_version: '',
    department_id: '',
  };
  const [form,        setForm]        = useState(EMPTY);
  const [departments, setDepartments]  = useState([]);
  const [loadingInit, setLoadingInit] = useState(isEdit);
  const [testing,     setTesting]     = useState(false);
  const [testResult,  setTestResult]  = useState(null);
  const [testMessage,  setTestMessage]  = useState('');
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState(null);
  const [rangeScanLoading, setRangeScanLoading] = useState(false);
  const [rangeFrom, setRangeFrom] = useState('1');
  const [rangeTo, setRangeTo] = useState('254');
  const [rangeHits, setRangeHits] = useState([]);
  /** On failed ZK probe, holds raw payload for debugging (optional JSON block). */
  const [zkDebug, setZkDebug] = useState(null);
  const saveLockRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await listDepartments({ page: 1, limit: 2000 });
        const inner = data?.data;
        const rows = Array.isArray(inner?.data) ? inner.data : Array.isArray(inner) ? inner : [];
        if (!cancelled) setDepartments(rows);
      } catch {
        if (!cancelled) setDepartments([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    getDevice(id)
      .then(({ data }) => {
        const d = data.data;
        setForm({
          name: d.name || '',
          ip_address: d.ip_address || '',
          port: d.port || '4370',
          comm_key: d.comm_key || '',
          type: d.type || 'FINGERPRINT',
          serial_number: d.serial_number || '',
          location: d.location || '',
          firmware_version: d.firmware_version || '',
          department_id: d.department_id != null ? String(d.department_id) : '',
        });
      })
      .catch(() => setError('Failed to load device'))
      .finally(() => setLoadingInit(false));
  }, [id, isEdit]);

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const rangePrefixFromHost = () => {
    const ip = String(form.ip_address || '').trim();
    const m = /^(\d+)\.(\d+)\.(\d+)\.\d+$/.exec(ip);
    if (!m) return '';
    return `${m[1]}.${m[2]}.${m[3]}`;
  };

  const handleRangeScan = async () => {
    const prefix = rangePrefixFromHost();
    if (!prefix) {
      setTestResult('error');
      setTestMessage('اكتب IP بصيغة IPv4 أولاً (مثال 192.168.1.20) حتى نفحص الرينج.');
      return;
    }
    const a = Number(rangeFrom);
    const b = Number(rangeTo);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b > 254 || b < a) {
      setTestResult('error');
      setTestMessage('حدود الرينج غير صحيحة: from يجب أن يكون <= to وبين 1 و 254.');
      return;
    }
    setRangeScanLoading(true);
    setRangeHits([]);
    setTestResult(null);
    setTestMessage('');
    try {
      const { data } = await scanZkRange({
        from_ip: `${prefix}.${a}`,
        to_ip: `${prefix}.${b}`,
        port: Number(form.port) || 4370,
        socket_timeout_ms: 2200,
        comm_key: form.comm_key?.trim() || undefined,
      });
      const inner = data?.data || data;
      const hits = Array.isArray(inner?.matches) ? inner.matches : [];
      setRangeHits(hits);
      if (hits.length > 0) {
        const first = hits[0];
        setForm((p) => ({
          ...p,
          ip_address: first.ip || p.ip_address,
          serial_number: first.serial_number || p.serial_number || makeFallbackSerial(first.ip || p.ip_address),
        }));
        setTestResult('success');
        setTestMessage(`تم العثور على ${hits.length} جهاز ضمن الرينج، وتم اختيار ${first.ip} تلقائياً.`);
      } else {
        setTestResult('error');
        setTestMessage('ماكو جهاز بصمة مستجيب ضمن الرينج المحدد.');
      }
    } catch (e) {
      setTestResult('error');
      setTestMessage(e?.response?.data?.error || e.message || 'فشل فحص الرينج.');
    } finally {
      setRangeScanLoading(false);
    }
  };

  /** LAN probe via backend relay/local agent, then zkteco-js and HTTP fallback if needed. */
  const handleTest = async () => {
    if (!form.ip_address?.trim()) return;
    setTesting(true);
    setTestResult(null);
    setTestMessage('');
    setZkDebug(null);
    const portRaw = form.port?.toString().trim();
    const zkPort = Number.isFinite(Number(portRaw)) && Number(portRaw) > 0 ? Number(portRaw) : 4370;

    try {
      const tryLocalBrowserAgent = async () => {
        try {
          const res = await probeLocalAgent({
            device_ip: form.ip_address.trim(),
            port: zkPort,
            comm_key: form.comm_key?.trim() || undefined,
            timeout_ms: 1200,
          });
          if (res?.status === 200 && res.data?.ok) {
            const nextSerial = res.data.serial_number || form.serial_number || makeFallbackSerial(form.ip_address);
            setForm((p) => ({ ...p, serial_number: nextSerial, firmware_version: res.data.firmware_version || p.firmware_version }));
            setTestResult('success');
            setTestMessage('تم فحص الاتصال مباشرة من المتصفح عبر Local Agent (localhost).');
            return true;
          }
        } catch (e) {
          // ignore and fallthrough to backend relay
        }
        return false;
      };

      const tryAgentProbe = async () => {
        const agentRes = await probeDeviceViaAgent({
          device_ip: form.ip_address.trim(),
          comm_key: form.comm_key?.trim() || undefined,
          timeout_ms: 1200,
        });
        const agentPayload = unwrapZkPayload(agentRes);
        if (agentPayload?.ok) {
          const nextSerial = agentPayload.serial_number
            || form.serial_number
            || makeFallbackSerial(form.ip_address);
          setForm((p) => ({
            ...p,
            serial_number: nextSerial,
            firmware_version: agentPayload.firmware_version || p.firmware_version,
          }));
          setTestResult('success');
          setTestMessage('تم فحص الاتصال عبر Local Agent داخل الشبكة المحلية.');
          return true;
        }
        return false;
      };

      const tryHttpSerial = async (vendor) => {
        const httpRes = await probeDeviceConnection({
          ip_address: form.ip_address.trim(),
          port: Number.isFinite(Number(portRaw)) && Number(portRaw) > 0 ? Number(portRaw) : undefined,
          vendor,
          quick: true,
        });
        const httpPayload = unwrapZkPayload(httpRes);
        if (httpPayload?.ok) {
          // Connection is valid even when some firmwares do not expose serial on HTTP probe.
          const nextSerial = httpPayload.serial_number
            || form.serial_number
            || makeFallbackSerial(form.ip_address);
          setForm((p) => ({
            ...p,
            serial_number: nextSerial,
            firmware_version: httpPayload.firmware_version || p.firmware_version,
          }));
          setTestResult('success');
          setTestMessage(
            httpPayload.serial_number
              ? (
                vendor === 'FINGERTIC'
                  ? 'تم الاتصال عبر واجهة الويب (Fingertic) بعد فشل أو نقص بيانات بروتوكول ZK.'
                  : 'تمت قراءة الرقم التسلسلي من واجهة الويب للجهاز (HTTP) بعد بروتوكول ZK.'
              )
              : `تم التحقق من الاتصال الحقيقي مع الجهاز (HTTP) والجهاز لم يرسل Serial؛ تم توليد Serial مؤقت (${nextSerial}) ويمكنك تعديله لاحقاً.`,
          );
          return true;
        }
        return false;
      };

      // Try direct browser → local-agent first (works when local-agent runs on the user's PC)
      if (await tryLocalBrowserAgent()) return;
      if (await tryAgentProbe()) return;

      const zkRes = await probeZkSocket({
        ip_address: form.ip_address.trim(),
        port: zkPort,
        comm_key: form.comm_key?.trim() || undefined,
        /** فحص سريع: تسلسل فقط (+ getInfo إن لزم) — مهلة أقصر؛ التفاصيل الكاملة من «مركز المزامنة». */
        minimal_probe: true,
        include_users: false,
        include_attendance_size: false,
        socket_timeout_ms: 4000,
      });
      let z = unwrapZkPayload(zkRes);

      if (z?.ok) {
        if (applyZkSnapshotToForm(setForm, z)) {
          setTestResult('success');
          setTestMessage('');
          return;
        }
        if (await tryHttpSerial('AUTO')) return;
        setTestResult('error');
        const hintSn = extractZkSerialFromSnapshot(z);
        setTestMessage(
          hintSn
            ? 'تعذّر تعبئة الرقم التسلسلي تلقائياً رغم وصول بيانات من الجهاز. انسخ الرقم يدوياً إلى الحقل.'
            : 'اتصل بالجهاز (ZK) لكن لم يُرجع رقمًا تسلسليًا معروفًا. تم أيضًا تجربة فحص Local Agent وواجهة الويب تلقائياً. جرّب إدخال الرقم من ملصق الجهاز إن لزم.',
        );
        setZkDebug(z);
        return;
      }

      if (await tryHttpSerial('AUTO')) return;
      if (form.type === 'HYBRID' && (await tryHttpSerial('FINGERTIC'))) return;

      setTestResult('error');
      setTestMessage(zkFailureMessage(z));
      setZkDebug(z || { ok: false });
    } catch (err) {
      setTestResult('error');
      let apiErr = err.response?.data?.error || err.response?.data?.message;
      const msg = String(err.message || '');
      const noResponse = err.response == null;
      if (
        !apiErr
        && noResponse
        && (err.code === 'ERR_NETWORK'
          || err.code === 'ECONNREFUSED'
          || msg === 'Network Error'
          || /ECONNREFUSED|Network Error/i.test(msg))
      ) {
        apiErr =
          'تعذّر الاتصال بخادم الـ API (غالباً المنفذ 5000). شغّل من جذر المشروع: npm run dev:all — أو تأكد أن الواجهة والـ API على نفس الجهاز إذا فتحت الرابط من شبكة محلية.';
      }
      setTestMessage(apiErr || err.message || 'فشل اختبار الشبكة المحلية أو الاتصال بالجهاز');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (saveLockRef.current) return;
    saveLockRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        ip_address: form.ip_address,
        serial_number: form.serial_number,
        location: form.location,
        type: form.type,
        firmware_version: form.firmware_version,
        comm_key: form.comm_key?.trim() || null,
        department_id: (() => {
          const raw = form.department_id;
          if (raw === '' || raw == null) return null;
          const n = Number(raw);
          return Number.isInteger(n) && n > 0 ? n : null;
        })(),
      };
      if (isEdit) {
        await updateDevice(id, payload);
        navigate('/devices/list');
      } else {
        await createDevice(payload);
        navigate('/devices/list');
      }
    } catch (err) {
      setError(toErrorString(err.response?.data?.error ?? err.response?.data?.message, 'Save failed'));
    } finally {
      setSaving(false);
      saveLockRef.current = false;
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          {toErrorString(error, '')}
        </div>
      )}
      {loadingInit && <div className="flex items-center justify-center h-32 text-gray-400"><span className="material-icons-round animate-spin text-3xl">sync</span></div>}
      {/* Header card */}
      <div className="bg-white rounded-xl shadow-card overflow-hidden">
        <div className="h-1.5" style={{ background: 'linear-gradient(90deg, #ab47bc, #7b1fa2)' }} />
        <div className="px-6 py-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg,#ab47bc,#7b1fa2)' }}>
            <span className="material-icons-round text-white text-xl">router</span>
          </div>
          <div>
            <h1 className="font-bold text-gray-800 text-lg">{isEdit ? t('device.edit') : t('device.add')}</h1>
            <p className="text-sm text-gray-400 mt-0.5">{isEdit ? 'Update device connection settings' : 'Connect a new biometric device to the system'}</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="bg-white rounded-xl shadow-card p-6 space-y-5">
        <h3 className="text-sm font-bold text-gray-600 uppercase tracking-wider border-b border-gray-100 pb-3">Device Information</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t('device.name')}>
            <input className="input" value={form.name} onChange={set('name')} placeholder="e.g. Main Gate – Door A" required />
          </Field>
          <Field label={t('device.department')}>
            <select className="input" value={form.department_id} onChange={set('department_id')}>
              <option value="">{t('device.department_all')}</option>
              {departments.map((dep) => (
                <option key={dep.id} value={String(dep.id)}>{dep.name_ar || dep.name}</option>
              ))}
            </select>
          </Field>
          <Field label={t('device.type')}>
            <select className="input" value={form.type} onChange={set('type')}>
              <option value="FINGERPRINT">{t('device.type_fingerprint')}</option>
              <option value="CARD">{t('device.type_card')}</option>
              <option value="FACE">{t('device.type_face')}</option>
              <option value="PIN">{t('device.type_pin')}</option>
              <option value="HYBRID">{t('device.type_hybrid')}</option>
            </select>
          </Field>
          <Field label={t('device.serial', 'Serial Number')}>
            <input className="input" value={form.serial_number} onChange={set('serial_number')} placeholder="e.g. ZK2024001" required />
          </Field>
          <Field label={t('device.location')}>
            <input className="input" value={form.location} onChange={set('location')} placeholder="e.g. Building A - Floor 1" />
          </Field>
        </div>

        <h3 className="text-sm font-bold text-gray-600 uppercase tracking-wider border-b border-gray-100 pb-3 pt-2">Network Settings</h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <Field label={t('device.host')}>
              <input
                className="input font-mono"
                value={form.ip_address}
                onChange={set('ip_address')}
                placeholder="192.168.1.10 · 2001:db8::1 · zk.local"
                required
              />
              <p className="mt-1 text-xs text-gray-400">{t('device.host_help')}</p>
            </Field>
          </div>
          <Field label={t('device.port')}>
            <input className="input font-mono" value={form.port} onChange={set('port')} placeholder="4370" />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Field label="Range From">
            <input className="input font-mono" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} placeholder="1" />
          </Field>
          <Field label="Range To">
            <input className="input font-mono" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} placeholder="254" />
          </Field>
          <div className="sm:col-span-2 flex items-end">
            <button
              type="button"
              onClick={handleRangeScan}
              disabled={rangeScanLoading}
              className="btn-ghost gap-2 text-sm border border-indigo-200 text-indigo-900"
            >
              <span className={`material-icons-round text-base ${rangeScanLoading ? 'animate-spin' : ''}`}>
                {rangeScanLoading ? 'sync' : 'radar'}
              </span>
              {rangeScanLoading ? 'جاري فحص الرينج…' : `فحص Range (${rangePrefixFromHost() || 'x.x.x'}.x)`}
            </button>
          </div>
        </div>
        {rangeHits.length > 0 && (
          <p className="text-xs text-indigo-700 bg-indigo-50 rounded px-3 py-2">
            تم العثور على: {rangeHits.slice(0, 8).map((h) => h.ip).join('، ')}{rangeHits.length > 8 ? ' ...' : ''}
          </p>
        )}

        <Field label="Comm Key (اختياري)">
          <input
            className="input font-mono"
            value={form.comm_key}
            onChange={set('comm_key')}
            placeholder="مثال: 12345"
          />
          <p className="mt-1 text-xs text-gray-400">
            بعض أجهزة ZKTeco المقفلة تتطلب هذا المفتاح قبل أوامر السحب (users / attendance).
          </p>
        </Field>

        <Field label={t('device.firmware', 'Firmware Version')}>
          <input className="input" value={form.firmware_version} onChange={set('firmware_version')} placeholder="e.g. v6.2.1" />
        </Field>

        {/* Test connection — ZK protocol (zkteco-js); HYBRID may fall back to web probe */}
        <div className="flex flex-col gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleTest}
              disabled={!form.ip_address?.trim() || testing}
              className="btn-ghost gap-2 text-sm flex-shrink-0 border border-violet-200 text-violet-900"
              title="اختبار الاتصال عبر Local Agent أو ZK/HTTP fallback بحسب إعدادات الشبكة"
            >
              <span className={`material-icons-round text-base ${testing ? 'animate-spin' : ''}`}>
                {testing ? 'sync' : 'fingerprint'}
              </span>
              {testing ? 'جاري فحص الشبكة المحلية…' : 'فحص الاتصال المحلي'}
            </button>
          </div>
          <p className="text-[11px] text-amber-800/90 leading-snug">
            الفحص يمر عبر الـ backend. إذا كان الجهاز داخل شبكة خاصة، استخدم Local Agent أو bridge على جهاز موجود بنفس LAN. الاعتماد الأساسي يبقى على مكتبة{' '}
            <a href="https://coding-libs.github.io/zkteco-js/" className="underline font-medium" target="_blank" rel="noreferrer">zkteco-js</a>
            {' '}(تجريبية — غير موصى بها للإنتاج حسب المؤلفين)، ثم fallback إلى فحص الويب عند الحاجة.
          </p>
          {testResult === 'success' && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 px-3 py-1.5 rounded-lg">
              <span className="material-icons-round text-sm">check_circle</span>
              تم الاتصال ببروتوكول ZK وملء الرقم التسلسلي والإصدار من الجهاز
            </span>
          )}
          {testResult === 'error' && (
            <span className="flex flex-col gap-1 text-xs font-semibold text-red-700 bg-red-50 px-3 py-1.5 rounded-lg max-w-md">
              <span className="flex items-center gap-1.5">
                <span className="material-icons-round text-sm shrink-0">error</span>
                فشل الاتصال أو قراءة البيانات
              </span>
              {testMessage && <span className="font-normal text-red-800/90 leading-snug whitespace-pre-wrap">{testMessage}</span>}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-3 border-t border-gray-100">
          <button type="button" onClick={() => navigate(-1)} className="btn-ghost flex-1">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
            {saving ? (
              <><span className="material-icons-round text-base animate-spin">sync</span> Saving…</>
            ) : (
              <><span className="material-icons-round text-base">save</span> {isEdit ? 'Update Device' : 'Add Device'}</>
            )}
          </button>
        </div>
      </form>

    </div>
  );
}
