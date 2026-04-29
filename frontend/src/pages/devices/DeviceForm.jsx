import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  getDevice,
  createDevice,
  updateDevice,
  probeDeviceConnection,
  probeZkSocket,
  getDevicePushConfig,
} from '../../api/device.api';
import { listDepartments } from '../../api/department.api';
import { applyZkSnapshotToForm, unwrapZkPayload, zkFailureMessage } from '../../lib/deviceZk';
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

/** نص واحد يلصقه المستخدم في ملاحظة أو يرسله لمن يضبط الجهاز — يشمل curl جاهز عند توفر المفتاح. */
function buildDeviceBindingClipboard({
  deviceName,
  serial,
  pushUrl,
  heartbeatUrl,
  apiKey,
  ipOnForm,
}) {
  const keyForCurl = apiKey && String(apiKey).trim() ? String(apiKey).trim() : 'PUT_API_KEY_HERE';
  const keyHuman = apiKey && String(apiKey).trim()
    ? String(apiKey).trim()
    : '(لا يوجد مفتاح في هذه النافذة — من قائمة الأجهزة: تدوير المفتاح Rotate key ثم أعد فتح «إعداد الإرسال»)';
  const iso = new Date().toISOString();
  const curl = [
    'curl -sS -X POST "' + (pushUrl || '') + '" \\',
    '  -H "Content-Type: application/json" \\',
    '  -H "X-Device-Serial: ' + (serial || '') + '" \\',
    '  -H "X-Device-Key: ' + keyForCurl + '" \\',
    "  -d '{\"logs\":[{\"card_number\":\"EMP001\",\"event_type\":\"CHECK_IN\",\"event_time\":\"" + iso + "\"}]}'",
  ].join('\n');

  return [
    '══════ ربط جهاز الحضور بالبرنامج (انسخ هذا النص كاملاً) ══════',
    '',
    'اسم الجهاز في النظام: ' + (deviceName || '—'),
    'عنوان الجهاز في نموذج النظام (مرجع فقط، ليس عنوان الخادم): ' + (ipOnForm || '—'),
    '',
    'الرقم التسلسلي — Header: X-Device-Serial',
    serial || '—',
    '',
    'مفتاح API — Header: X-Device-Key',
    keyHuman,
    '',
    '▶ عنوان السيرفر في الجهاز (ZKTeco: Communication / ADMS / Server URL — يجب أن يشير إلى حاسبة الـ API):',
    pushUrl || '(فشل التحميل — عيّن PUBLIC_API_URL في ملف backend/.env ثم أعد فتح النافذة)',
    '',
    '▶ نبض اختياري:',
    heartbeatUrl || '—',
    '',
    '▶ أمر اختبار من الطرفية على نفس الحاسبة التي تشغّل الـ API (غيّر EMP001 لرقم موظف عندك):',
    curl,
    '',
    'خطوات: 1) حفظ الإعدادات في الجهاز  2) الأجهزة ← مركز المزامنة ← «اختبار استقبال»  3) «معالجة الحضور» للتاريخ.',
    '',
  ].join('\n');
}

export default function DeviceForm() {
  const { t }    = useTranslation();
  const navigate = useNavigate();
  const { id }   = useParams();
  const isEdit   = !!id;

  const EMPTY = {
    name: '',
    ip_address: '',
    port: '4370',
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
  /** After create, or from edit: show server URLs + optional one-time api_key */
  const [setupModal, setSetupModal]   = useState(null);
  const [pushConfig, setPushConfig]   = useState(null);
  const [copyBundleFlash, setCopyBundleFlash] = useState(false);
  /** On failed ZK probe, holds raw payload for debugging (optional JSON block). */
  const [zkDebug, setZkDebug] = useState(null);
  const saveLockRef = useRef(false);

  useEffect(() => {
    if (!setupModal?.deviceId) {
      setPushConfig(null);
      return;
    }
    let cancelled = false;
    getDevicePushConfig(setupModal.deviceId)
      .then(({ data: body }) => {
        if (!cancelled) setPushConfig(body?.data ?? null);
      })
      .catch(() => { if (!cancelled) setPushConfig(null); });
    return () => { cancelled = true; };
  }, [setupModal?.deviceId]);

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

  const copyFullDeviceBinding = async () => {
    if (!pushConfig || !setupModal) return;
    const text = buildDeviceBindingClipboard({
      deviceName   : setupModal.deviceName,
      serial       : setupModal.serial_number,
      pushUrl      : pushConfig.push_url,
      heartbeatUrl : pushConfig.heartbeat_url,
      apiKey       : setupModal.api_key,
      ipOnForm     : form.ip_address,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopyBundleFlash(true);
      window.setTimeout(() => setCopyBundleFlash(false), 3200);
    } catch {
      setCopyBundleFlash(false);
    }
  };

  /** LAN read via zkteco-js (ZK TCP/UDP). HYBRID falls back to HTTP web probe if ZK fails. */
  const handleTest = async () => {
    if (!form.ip_address?.trim()) return;
    setTesting(true);
    setTestResult(null);
    setTestMessage('');
    setZkDebug(null);
    const portRaw = form.port?.toString().trim();
    const zkPort = Number.isFinite(Number(portRaw)) && Number(portRaw) > 0 ? Number(portRaw) : 4370;

    try {
      const zkRes = await probeZkSocket({
        ip_address: form.ip_address.trim(),
        port: zkPort,
      });
      let z = unwrapZkPayload(zkRes);

      if (!z?.ok && form.type === 'HYBRID') {
        const httpRes = await probeDeviceConnection({
          ip_address: form.ip_address,
          port: Number.isFinite(Number(portRaw)) && Number(portRaw) > 0 ? Number(portRaw) : undefined,
          vendor: 'FINGERTIC',
        });
        const httpPayload = unwrapZkPayload(httpRes);
        if (httpPayload?.ok && httpPayload.serial_number) {
          setForm((p) => ({
            ...p,
            serial_number: httpPayload.serial_number,
            firmware_version: httpPayload.firmware_version || p.firmware_version,
          }));
          setTestResult('success');
          setTestMessage('تم الاتصال عبر واجهة الويب (Fingertic) بعد فشل بروتوكول ZK.');
          return;
        }
      }

      if (z?.ok) {
        if (applyZkSnapshotToForm(setForm, z)) {
          setTestResult('success');
          setTestMessage('');
          return;
        }
        setTestResult('error');
        setTestMessage('اتصل بالجهاز لكن لم يُرجع رقمًا تسلسليًا صالحًا في الحقل.');
        setZkDebug(z);
        return;
      }

      setTestResult('error');
      setTestMessage(zkFailureMessage(z));
      setZkDebug(z || { ok: false });
    } catch (err) {
      setTestResult('error');
      setTestMessage(err.response?.data?.error || err.message || 'فشل اختبار الاتصال');
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
        const { data: body } = await createDevice(payload);
        const d = body?.data;
        if (d?.id && d?.api_key) {
          setSetupModal({
            deviceId      : d.id,
            api_key       : d.api_key,
            deviceName    : d.name,
            serial_number : d.serial_number,
          });
        } else {
          navigate('/devices/list');
        }
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
              title="zkteco-js — بروتوكول ZK على المنفذ الحالي في النموذج"
            >
              <span className={`material-icons-round text-base ${testing ? 'animate-spin' : ''}`}>
                {testing ? 'sync' : 'fingerprint'}
              </span>
              {testing ? 'جاري الاتصال…' : t('device.test_conn')}
            </button>
          </div>
          <p className="text-[11px] text-amber-800/90 leading-snug">
            الاعتماد الأساسي: مكتبة{' '}
            <a href="https://coding-libs.github.io/zkteco-js/" className="underline font-medium" target="_blank" rel="noreferrer">zkteco-js</a>
            {' '}(تجريبية — غير موصى بها للإنتاج حسب المؤلفين). نوع «HYBRID»: إن فشل ZK يُجرى اختبار واجهة الويب (Fingertic).
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

        {isEdit && (
          <button
            type="button"
            className="btn-ghost text-sm gap-2 w-full justify-center border border-gray-200"
            onClick={() => setSetupModal({
              deviceId: Number(id),
              api_key: null,
              deviceName: form.name,
              serial_number: form.serial_number,
            })}
          >
            <span className="material-icons-round text-base">settings_ethernet</span>
            عرض عنوان الإرسال للجهاز (ADMS / Push URL)
          </button>
        )}

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

      {setupModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-card-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-bold text-gray-800 text-lg">إعداد الجهاز لإرسال الحضور</h3>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-700"
                onClick={() => {
                  setSetupModal(null);
                  setPushConfig(null);
                  setCopyBundleFlash(false);
                  if (!isEdit) navigate('/devices/list');
                }}
              >
                <span className="material-icons-round">close</span>
              </button>
            </div>
            {copyBundleFlash && (
              <p className="text-sm font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                تم نسخ نص الإعداد كاملاً — الصقه في ملاحظة أو أرسله لمن يضبط الجهاز.
              </p>
            )}
            {setupModal.api_key && (
              <div className="rounded-lg bg-violet-50 border border-violet-200 p-3">
                <p className="text-xs font-bold text-violet-800 uppercase tracking-wide">API Key (انسخه الآن — لن يُعرض مرة أخرى)</p>
                <code className="mt-1 block text-xs break-all font-mono text-violet-950 select-all">{setupModal.api_key}</code>
                <button
                  type="button"
                  className="mt-2 text-xs font-semibold text-violet-700 underline"
                  onClick={() => navigator.clipboard?.writeText(setupModal.api_key)}
                >
                  نسخ المفتاح
                </button>
              </div>
            )}
            {!setupModal.api_key && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                مفتاح API غير متوفر هنا. من قائمة الأجهزة استخدم «تدوير المفتاح» (Rotate key) لإنشاء مفتاح جديد ثم عُد لهذه النافذة.
              </p>
            )}
            <div className="text-sm text-gray-700 space-y-2">
              <p><strong>الرقم التسلسلي في الهيدر:</strong> <code className="bg-gray-100 px-1 rounded text-xs">{setupModal.serial_number}</code></p>
              {pushConfig ? (
                <>
                  <p><strong>رابط الإرسال (Push):</strong></p>
                  <code className="block text-xs bg-gray-900 text-green-400 p-3 rounded-lg break-all">{pushConfig.push_url}</code>
                  <p><strong>نبض (Heartbeat):</strong></p>
                  <code className="block text-xs bg-gray-100 p-2 rounded break-all">{pushConfig.heartbeat_url}</code>
                  {pushConfig.note_ar && <p className="text-xs text-gray-600 leading-relaxed border-t pt-2">{pushConfig.note_ar}</p>}
                  {pushConfig.curl_example && (
                    <>
                      <p className="font-semibold mt-2">أمر curl للاختبار من الحاسبة:</p>
                      <pre className="text-[11px] bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">{pushConfig.curl_example}</pre>
                      <p className="text-xs text-gray-500">استبدل النص بين علامات المفتاح في curl بمفتاح API أعلاه، وغيّر EMP001 إلى رقم موظف مسجّل في النظام.</p>
                    </>
                  )}
                </>
              ) : (
                <p className="text-gray-500 text-sm">جاري تحميل عناوين الخادم…</p>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                className="btn-ghost gap-2 text-sm border border-gray-200"
                disabled={!pushConfig}
                onClick={copyFullDeviceBinding}
              >
                <span className="material-icons-round text-base">content_copy</span>
                نسخ كل إعدادات الربط (نص واحد + curl)
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setSetupModal(null);
                  setPushConfig(null);
                  setCopyBundleFlash(false);
                  if (!isEdit) navigate('/devices/list');
                }}
              >
                {isEdit ? 'إغلاق' : 'تم — الانتقال لقائمة الأجهزة'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
