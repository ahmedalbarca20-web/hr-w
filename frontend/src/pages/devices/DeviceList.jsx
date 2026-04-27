import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listDevices, deleteDevice, readZkFromDevice } from '../../api/device.api';
import { unwrapZkPayload, zkLiveSummaryLine } from '../../lib/deviceZk';
import { listDepartments } from '../../api/department.api';
import Alert from '../../components/common/Alert';

const STATUS_CFG = {
  ACTIVE:   { bg: '#e8f5e9', text: '#2e7d32', dot: '#4caf50', label: 'Active'   },
  INACTIVE: { bg: '#fff3e0', text: '#e65100', dot: '#ff9800', label: 'Inactive' },
  OFFLINE:  { bg: '#ffebee', text: '#c62828', dot: '#f44336', label: 'Offline'  },
};

function StatusBadge({ status }) {
  const s = STATUS_CFG[status] || STATUS_CFG.offline;
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{ background: s.bg, color: s.text }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.dot }} />
      {s.label}
    </span>
  );
}

export default function DeviceList() {
  const { t }     = useTranslation();
  const navigate  = useNavigate();
  const [search,   setSearch]   = useState('');
  const [filter,   setFilter]   = useState('all');
  const [deptFilter, setDeptFilter] = useState('');
  const [departments, setDepartments] = useState([]);
  const [devices,  setDevices]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [alert,    setAlert]    = useState(null);
  const [delId,    setDelId]    = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [zkBusyId, setZkBusyId] = useState(null);
  const deleteLockRef = useRef(false);

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (deptFilter) params.department_id = deptFilter;
      const { data } = await listDevices(params);
      const raw = data.data;
      setDevices(raw?.devices || raw || []);
    } catch (e) {
      setAlert({ type: 'danger', msg: e.response?.data?.error || 'Failed to load devices' });
    } finally {
      setLoading(false);
    }
  }, [deptFilter]);

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

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  const handleDelete = async () => {
    if (!delId || deleteLockRef.current) return;
    deleteLockRef.current = true;
    setDeleting(true);
    try {
      await deleteDevice(delId);
      setDevices((prev) => prev.filter((d) => d.id !== delId));
      setAlert({ type: 'success', msg: 'Device deleted' });
    } catch (e) {
      setAlert({ type: 'danger', msg: e.response?.data?.error || 'Delete failed' });
    } finally {
      setDeleting(false);
      setDelId(null);
      deleteLockRef.current = false;
    }
  };

  const pullZkRow = async (d) => {
    if (zkBusyId || d.status === 'OFFLINE') return;
    setZkBusyId(d.id);
    try {
      const res = await readZkFromDevice(d.id, {});
      setAlert({ type: 'success', msg: zkLiveSummaryLine(unwrapZkPayload(res)) });
    } catch (e) {
      setAlert({ type: 'danger', msg: e.response?.data?.error || e.message || 'تعذّر قراءة الجهاز' });
    } finally {
      setZkBusyId(null);
    }
  };

  const filtered = devices.filter((d) => {
    const deptName = (d.department?.name_ar || d.department?.name || '').toLowerCase();
    const matchSearch =
      (d.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (d.ip_address || '').toLowerCase().includes(search.toLowerCase()) ||
      deptName.includes(search.toLowerCase());
    const matchFilter = filter === 'all' || d.status === filter;
    return matchSearch && matchFilter;
  });

  return (
    <div className="space-y-5">
      {alert && <Alert type={alert.type} message={alert.msg} onClose={() => setAlert(null)} />}
      {/* Toolbar */}
      <div className="bg-white rounded-xl shadow-card px-5 py-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('device.search_placeholder', 'Search by name, address, or branch…')}
            className="input pl-9"
          />
        </div>

        <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="input min-w-40 max-w-xs">
          <option value="">{t('device.department_all')}</option>
          {departments.map((dep) => (
            <option key={dep.id} value={String(dep.id)}>{dep.name_ar || dep.name}</option>
          ))}
        </select>

        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="input w-36">
          <option value="all">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="OFFLINE">Offline</option>
        </select>

        <button onClick={() => navigate('/devices/add')} className="btn-primary gap-2 flex-shrink-0">
          <span className="material-icons-round text-base">add</span>
          {t('device.add')}
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-card overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800">{t('device.title')}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{filtered.length} devices</p>
          </div>
          <button onClick={() => navigate('/devices/sync')} className="btn-ghost text-sm gap-2">
            <span className="material-icons-round text-base">sync</span>
            {t('device.sync_all')}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="th">{t('device.name')}</th>
                <th className="th">{t('device.host')}</th>
                <th className="th hidden sm:table-cell">{t('device.department')}</th>
                <th className="th hidden md:table-cell">{t('device.model')}</th>
                <th className="th hidden lg:table-cell">{t('device.location')}</th>
                <th className="th">{t('device.status')}</th>
                <th className="th hidden lg:table-cell">{t('device.last_sync')}</th>
                <th className="th hidden lg:table-cell text-end">{t('device.records')}</th>
                <th className="th w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="td text-center text-gray-400 py-12">
                    <span className="material-icons-round text-4xl block mb-2 text-gray-200">device_hub</span>
                    No devices found
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={9} className="td text-center py-8 text-gray-400">
                    <span className="material-icons-round animate-spin text-3xl">sync</span>
                  </td>
                </tr>
              )}
              {filtered.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="td">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-brand/8 flex items-center justify-center flex-shrink-0">
                        <span className="material-icons-round text-brand text-base">router</span>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800 text-sm">{d.name}</p>
                        <p className="text-xs text-gray-400">{d.serial_number}</p>
                      </div>
                    </div>
                  </td>
                  <td className="td font-mono text-xs text-gray-500 break-all max-w-[10rem] md:max-w-none">{d.ip_address || '—'}</td>
                  <td className="td hidden sm:table-cell text-xs text-gray-600">{d.department?.name_ar || d.department?.name || '—'}</td>
                  <td className="td hidden md:table-cell text-sm text-gray-600">{d.type}</td>
                  <td className="td hidden lg:table-cell text-xs text-gray-500">{d.location}</td>
                  <td className="td"><StatusBadge status={d.status} /></td>
                  <td className="td hidden lg:table-cell text-xs text-gray-400">{d.last_sync ? new Date(d.last_sync).toLocaleString() : '—'}</td>
                  <td className="td hidden lg:table-cell text-end">
                    <span className="text-sm font-semibold text-gray-700">{d.firmware_version || '—'}</span>
                  </td>
                  <td className="td">
                    <div className="flex items-center gap-1">
                      <button onClick={() => navigate(`/devices/edit/${d.id}`)} className="p-1.5 rounded-lg text-gray-400 hover:text-brand hover:bg-brand/5 transition" title="Edit">
                        <span className="material-icons-round text-base">edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => pullZkRow(d)}
                        disabled={zkBusyId === d.id || d.status === 'OFFLINE'}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-violet-700 hover:bg-violet-50 transition disabled:opacity-40"
                        title="قراءة من الجهاز (ZK)"
                      >
                        <span className={`material-icons-round text-base ${zkBusyId === d.id ? 'animate-spin' : ''}`}>
                          {zkBusyId === d.id ? 'sync' : 'fingerprint'}
                        </span>
                      </button>
                      <button onClick={() => navigate('/devices/sync')} className="p-1.5 rounded-lg text-gray-400 hover:text-info hover:bg-info/5 transition" title="Sync">
                        <span className="material-icons-round text-base">sync</span>
                      </button>
                      <button onClick={() => setDelId(d.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-danger hover:bg-danger/5 transition" title="Delete">
                        <span className="material-icons-round text-base">delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete confirm */}
      {delId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-card-lg p-6 max-w-sm w-full">
            <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center mx-auto mb-4">
              <span className="material-icons-round text-danger text-2xl">delete_forever</span>
            </div>
            <h3 className="text-center font-semibold text-gray-800 mb-1">Delete Device</h3>
            <p className="text-center text-sm text-gray-500 mb-6">This will remove the device and all its logs. This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDelId(null)} className="btn-ghost flex-1">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="btn-danger flex-1">
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
