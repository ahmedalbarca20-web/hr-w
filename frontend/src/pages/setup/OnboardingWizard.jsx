import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getSetupStatus,
  postSetupStart,
  postSetupWorkHours,
  postSetupTestDevice,
  postSetupDevice,
  postSetupImportList,
  postSetupImportRun,
  postSetupComplete,
} from '../../api/setup.api';
import { useAuth } from '../../context/AuthContext';

const WEEKDAYS = [
  { v: 1, label: 'Mon' },
  { v: 2, label: 'Tue' },
  { v: 3, label: 'Wed' },
  { v: 4, label: 'Thu' },
  { v: 5, label: 'Fri' },
  { v: 6, label: 'Sat' },
  { v: 0, label: 'Sun' },
];

function friendlyErr(e) {
  const m = e.response?.data?.error || e.message;
  return typeof m === 'string' && m.trim() ? m : 'Something went wrong. Please try again.';
}

export default function OnboardingWizard() {
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();

  const [status, setStatus] = useState(null);
  const [activeStep, setActiveStep] = useState(1);
  const [loadErr, setLoadErr] = useState('');
  const [banner, setBanner] = useState(null);

  const [workStart, setWorkStart] = useState('09:00');
  const [workEnd, setWorkEnd] = useState('17:00');
  const [workDays, setWorkDays] = useState([1, 2, 3, 4, 5]);

  const [deviceName, setDeviceName] = useState('');
  const [deviceIp, setDeviceIp] = useState('');
  const [deviceId, setDeviceId] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testOk, setTestOk] = useState(false);

  const [roster, setRoster] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  const maxNav = status?.current_step ?? 1;

  const refresh = useCallback(async () => {
    const { data } = await getSetupStatus();
    const s = data?.data;
    setStatus(s);
    const next = Math.min(4, Math.max(1, s?.current_step ?? 1));
    setActiveStep((prev) => Math.min(Math.max(prev, 1), next));
    return s;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await postSetupStart();
        const s = await refresh();
        if (!cancelled && s) setActiveStep(Math.min(4, Math.max(1, s.current_step ?? 1)));
      } catch (e) {
        if (!cancelled) setLoadErr(friendlyErr(e));
      }
    })();
    return () => { cancelled = true; };
  }, [refresh]);

  const progressPct = useMemo(() => (activeStep / 4) * 100, [activeStep]);

  const goStep = (n) => {
    if (n < 1 || n > 4) return;
    if (n > maxNav) return;
    setActiveStep(n);
    setBanner(null);
  };

  const toggleDay = (v) => {
    setWorkDays((prev) => {
      const has = prev.includes(v);
      if (has) return prev.filter((x) => x !== v);
      return [...prev, v].sort((a, b) => a - b);
    });
  };

  const submitHours = async () => {
    setBusy(true);
    setBanner(null);
    try {
      await postSetupWorkHours({
        work_start: workStart,
        work_end: workEnd,
        work_days: workDays,
      });
      const s = await refresh();
      setActiveStep(Math.min(4, Math.max(1, s?.current_step ?? 2)));
      setBanner({ type: 'ok', text: 'Working hours saved.' });
    } catch (e) {
      setBanner({ type: 'err', text: friendlyErr(e) });
    } finally {
      setBusy(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setBanner(null);
    setTestOk(false);
    try {
      const { data } = await postSetupTestDevice({ ip_address: deviceIp });
      const ok = Boolean(data?.data?.ok);
      setTestOk(ok);
      setBanner({
        type: ok ? 'ok' : 'err',
        text: data?.data?.message || (ok ? 'Connection succeeded.' : 'Could not reach the device.'),
      });
    } catch (e) {
      setBanner({ type: 'err', text: friendlyErr(e) });
    } finally {
      setTesting(false);
    }
  };

  const submitDevice = async () => {
    setBusy(true);
    setBanner(null);
    try {
      const { data } = await postSetupDevice({ name: deviceName, ip_address: deviceIp });
      const d = data?.data?.device;
      if (d?.id) setDeviceId(d.id);
      const s = await refresh();
      setActiveStep(Math.min(4, Math.max(1, s?.current_step ?? 3)));
      setBanner({ type: 'ok', text: 'Device saved.' });
    } catch (e) {
      setBanner({ type: 'err', text: friendlyErr(e) });
    } finally {
      setBusy(false);
    }
  };

  const fetchRoster = async () => {
    setBusy(true);
    setBanner(null);
    try {
      const { data } = await postSetupImportList(deviceId ? { device_id: deviceId } : {});
      const users = data?.data?.users || [];
      setRoster(users);
      setSelected(new Set(users.map((u) => Number(u.uid)).filter((n) => Number.isInteger(n))));
      setBanner({ type: 'ok', text: users.length ? `Found ${users.length} people on the device.` : 'No people were returned from the device.' });
    } catch (e) {
      setBanner({ type: 'err', text: friendlyErr(e) });
    } finally {
      setBusy(false);
    }
  };

  const importSelected = async (all) => {
    setBusy(true);
    setBanner(null);
    try {
      const uids = all ? roster.map((u) => Number(u.uid)).filter((n) => Number.isInteger(n)) : [...selected];
      if (!all && uids.length === 0) {
        setBanner({ type: 'err', text: 'Select at least one person, or use Import All.' });
        setBusy(false);
        return;
      }
      const { data } = await postSetupImportRun({ uids, device_id: deviceId || undefined });
      setStatus(data?.data);
      const s = await refresh();
      setActiveStep(Math.min(4, Math.max(1, s?.current_step ?? 4)));
      setBanner({ type: 'ok', text: `Imported ${data?.data?.imported ?? uids.length} people.` });
    } catch (e) {
      setBanner({ type: 'err', text: friendlyErr(e) });
    } finally {
      setBusy(false);
    }
  };

  const skipImport = async () => {
    setBusy(true);
    setBanner(null);
    try {
      await postSetupImportRun({ skip: true });
      const s = await refresh();
      setActiveStep(Math.min(4, Math.max(1, s?.current_step ?? 4)));
      setBanner({ type: 'ok', text: 'You can add employees anytime from the menu.' });
    } catch (e) {
      setBanner({ type: 'err', text: friendlyErr(e) });
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    setBanner(null);
    try {
      await postSetupComplete();
      await refreshProfile();
      navigate('/', { replace: true });
    } catch (e) {
      setBanner({ type: 'err', text: friendlyErr(e) });
    } finally {
      setBusy(false);
    }
  };

  if (loadErr) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md rounded-xl bg-white shadow-card p-6 text-center text-gray-700">
          <p className="mb-4">{loadErr}</p>
          <button type="button" className="btn-primary" onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Loading…</p>
      </div>
    );
  }

  const steps = [
    { id: 1, title: 'Working Hours', desc: 'Schedule' },
    { id: 2, title: 'Devices', desc: 'Connect' },
    { id: 3, title: 'Employees', desc: 'Import' },
    { id: 4, title: 'Finish', desc: 'Done' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      <aside className="w-full md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-gray-200 bg-white p-6">
        <h1 className="text-lg font-bold text-gray-900 mb-1">Welcome</h1>
        <p className="text-xs text-gray-500 mb-6">Set up your company in a few steps.</p>
        <nav className="space-y-1">
          {steps.map((s) => {
            const locked = s.id > maxNav;
            const active = activeStep === s.id;
            return (
              <button
                key={s.id}
                type="button"
                disabled={locked}
                onClick={() => goStep(s.id)}
                className={`w-full text-left rounded-lg px-3 py-2.5 text-sm transition ${
                  active ? 'bg-brand/10 text-brand font-semibold ring-1 ring-brand/20' : 'text-gray-700 hover:bg-gray-50'
                } ${locked ? 'opacity-40 cursor-not-allowed hover:bg-transparent' : ''}`}
              >
                <span className="block text-xs text-gray-500">{s.desc}</span>
                {s.title}
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="flex-1 p-6 md:p-10 max-w-2xl mx-auto w-full">
        <div className="mb-6">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Step {activeStep} of 4</span>
            <span>{Math.round(progressPct)}%</span>
          </div>
          <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
            <div className="h-full bg-brand transition-all duration-300" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        {banner && (
          <div className={`mb-4 rounded-lg px-4 py-3 text-sm ${banner.type === 'ok' ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-800'}`}>
            {banner.text}
          </div>
        )}

        {activeStep === 1 && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-gray-900">Set Company Working Hours</h2>
            <p className="text-sm text-gray-600">Define the official working schedule for attendance calculations.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Work start time</label>
                <input type="time" className="input" value={workStart} onChange={(e) => setWorkStart(e.target.value)} />
              </div>
              <div>
                <label className="label">Work end time</label>
                <input type="time" className="input" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label">Working days (optional)</label>
              <div className="flex flex-wrap gap-2 mt-2">
                {WEEKDAYS.map((d) => (
                  <label key={d.v} className="inline-flex items-center gap-1.5 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={workDays.includes(d.v)}
                      onChange={() => toggleDay(d.v)}
                    />
                    {d.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end pt-4">
              <button type="button" className="btn-primary" disabled={busy || workDays.length === 0} onClick={submitHours}>
                {busy ? 'Saving…' : 'Next — Add Devices'}
              </button>
            </div>
          </div>
        )}

        {activeStep === 2 && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-gray-900">Connect Attendance Devices</h2>
            <p className="text-sm text-gray-600">Add fingerprint devices used in your company.</p>
            <div>
              <label className="label">Device name</label>
              <input className="input" value={deviceName} onChange={(e) => setDeviceName(e.target.value)} placeholder="e.g. Main entrance" />
            </div>
            <div>
              <label className="label">Device IP address</label>
              <input className="input font-mono" value={deviceIp} onChange={(e) => setDeviceIp(e.target.value)} placeholder="192.168.1.201" />
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn-ghost" disabled={testing || !deviceIp.trim()} onClick={runTest}>
                {testing ? 'Testing…' : 'Test connection'}
              </button>
            </div>
            {!testOk && deviceIp.trim() && (
              <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
                Run a connection test before continuing. If your network blocks the check, you can still try saving — the device may work once it is on the same network as this app.
              </p>
            )}
            <div className="flex justify-end pt-4">
              <button
                type="button"
                className="btn-primary"
                disabled={busy || !deviceName.trim() || !deviceIp.trim()}
                onClick={submitDevice}
              >
                {busy ? 'Saving…' : 'Next — Sync Employees'}
              </button>
            </div>
          </div>
        )}

        {activeStep === 3 && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-gray-900">Import Employees</h2>
            <p className="text-sm text-gray-600">Import employee data directly from the attendance device.</p>
            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn-ghost" disabled={busy} onClick={fetchRoster}>
                {busy ? 'Please wait…' : 'Fetch Employees from Device'}
              </button>
            </div>
            {roster.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white max-h-64 overflow-y-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-3 py-2 text-left w-10">
                        <input
                          type="checkbox"
                          aria-label="Select all"
                          checked={selected.size === roster.length && roster.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelected(new Set(roster.map((u) => Number(u.uid)).filter(Number.isInteger)));
                            } else {
                              setSelected(new Set());
                            }
                          }}
                        />
                      </th>
                      <th className="px-3 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-left">ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roster.map((u) => {
                      const id = Number(u.uid);
                      const checked = selected.has(id);
                      return (
                        <tr key={id} className="border-t border-gray-100">
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setSelected((prev) => {
                                  const n = new Set(prev);
                                  if (n.has(id)) n.delete(id);
                                  else n.add(id);
                                  return n;
                                });
                              }}
                            />
                          </td>
                          <td className="px-3 py-2">{u.name || '—'}</td>
                          <td className="px-3 py-2 font-mono text-gray-600">{id}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn-primary" disabled={busy || roster.length === 0} onClick={() => importSelected(true)}>
                Import All
              </button>
              <button type="button" className="btn-ghost" disabled={busy || roster.length === 0} onClick={() => importSelected(false)}>
                Import selected
              </button>
              <button type="button" className="btn-ghost text-gray-600" disabled={busy} onClick={skipImport}>
                I’ll add people later
              </button>
            </div>
            <div className="flex justify-end pt-4">
              <button
                type="button"
                className="btn-primary"
                disabled={busy || Number(status?.last_completed_step ?? 0) < 3}
                onClick={() => goStep(4)}
              >
                Next — Finish Setup
              </button>
            </div>
          </div>
        )}

        {activeStep === 4 && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-gray-900">Setup Completed Successfully</h2>
            <p className="text-sm text-gray-600">Here is a quick summary. You can change any of these later from settings.</p>
            <ul className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 text-sm">
              <li className="px-4 py-3 flex justify-between">
                <span className="text-gray-600">Devices added</span>
                <span className="font-semibold text-gray-900">{status.device_count ?? 0}</span>
              </li>
              <li className="px-4 py-3 flex justify-between">
                <span className="text-gray-600">Employees in the system</span>
                <span className="font-semibold text-gray-900">{status.employee_count ?? 0}</span>
              </li>
              <li className="px-4 py-3 flex justify-between">
                <span className="text-gray-600">Status</span>
                <span className="font-semibold text-emerald-700">Connected · Active</span>
              </li>
            </ul>
            <div className="flex justify-end pt-4">
              <button type="button" className="btn-primary" disabled={busy} onClick={finish}>
                {busy ? 'Opening…' : 'Go to Dashboard'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
