import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listDevices, readZkFromDevice } from '../../api/device.api';
import { unwrapZkPayload, zkLiveSummaryLine } from '../../lib/deviceZk';

/* ── Status config uses real API values ──────────────────────────────── */
const STATUS_CFG = {
  ACTIVE:   { bg: '#e8f5e9', text: '#2e7d32', dot: '#4caf50', icon: 'check_circle',  label: 'Active'   },
  INACTIVE: { bg: '#fff3e0', text: '#e65100', dot: '#ff9800', icon: 'warning',       label: 'Inactive' },
  OFFLINE:  { bg: '#ffebee', text: '#c62828', dot: '#f44336', icon: 'cancel',        label: 'Offline'  },
};

function StatusBadge({ status }) {
  const s = STATUS_CFG[status] || STATUS_CFG.OFFLINE;
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: s.bg, color: s.text }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
      {s.label}
    </span>
  );
}

function SummaryCard({ icon, label, value, gradient, textColor }) {
  return (
    <div className="bg-white rounded-xl shadow-card p-5 flex items-center gap-4">
      <div className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: gradient }}>
        <span className="material-icons-round text-white text-xl">{icon}</span>
      </div>
      <div>
        <p className="text-2xl font-bold" style={{ color: textColor }}>{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

export default function DevicesOverview() {
  const { t }    = useTranslation();
  const navigate = useNavigate();
  const [devices,  setDevices]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [syncing,  setSyncing]  = useState(null);
  const [zkBanner, setZkBanner] = useState('');

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await listDevices();
      setDevices(data.data?.devices || data.data || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  const active  = devices.filter((d) => d.status === 'ACTIVE').length;
  const offline = devices.filter((d) => d.status === 'OFFLINE').length;

  const handleSync = async (id) => {
    if (!id || syncing) return;
    setSyncing(id);
    setZkBanner('');
    try {
      const res = await readZkFromDevice(id, {});
      const z = unwrapZkPayload(res);
      setZkBanner(zkLiveSummaryLine(z));
    } catch (e) {
      setZkBanner(e.response?.data?.error || e.message || 'تعذّر قراءة الجهاز');
    } finally {
      setSyncing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400">
        <span className="material-icons-round animate-spin text-4xl">sync</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {zkBanner && (
        <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm text-violet-900">
          {zkBanner}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard icon="router"       label="Total Devices"        value={devices.length} gradient="linear-gradient(135deg,#ab47bc,#7b1fa2)" textColor="#7b1fa2" />
        <SummaryCard icon="check_circle" label={t('device.online', 'Active')}  value={active}  gradient="linear-gradient(135deg,#66bb6a,#388e3c)" textColor="#388e3c" />
        <SummaryCard icon="cancel"       label={t('device.offline', 'Offline')} value={offline} gradient="linear-gradient(135deg,#ef5350,#c62828)" textColor="#c62828" />
        <SummaryCard icon="fingerprint"  label={t('device.total_records', 'Inactive')} value={devices.length - active - offline} gradient="linear-gradient(135deg,#26c6da,#0097a7)" textColor="#0097a7" />
      </div>

      {/* Device cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {devices.map((d) => {
          const s = STATUS_CFG[d.status] || STATUS_CFG.OFFLINE;
          return (
            <div key={d.id} className="bg-white rounded-xl shadow-card overflow-hidden border border-gray-100 hover:shadow-card-lg transition-shadow">
              {/* Top bar */}
              <div className="h-1.5 w-full" style={{ background: s.dot }} />
              <div className="p-5">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: s.bg }}>
                      <span className="material-icons-round text-xl" style={{ color: s.text }}>router</span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-800 text-sm truncate">{d.name}</p>
                      <p className="text-xs text-gray-400 font-mono">{d.ip_address || '—'}</p>
                    </div>
                  </div>
                  <StatusBadge status={d.status} />
                </div>

                <div className="grid grid-cols-2 gap-2 mb-4">
                  {[
                    { label: 'Type',      value: d.type },
                    { label: 'Location',  value: d.location || '—' },
                    { label: 'Last Sync', value: d.last_sync ? new Date(d.last_sync).toLocaleDateString() : '—' },
                    { label: 'Firmware',  value: d.firmware_version || '—' },
                  ].map((row) => (
                    <div key={row.label} className="bg-gray-50 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">{row.label}</p>
                      <p className="text-xs font-semibold text-gray-700 truncate mt-0.5">{row.value}</p>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleSync(d.id)}
                    disabled={syncing === d.id || d.status === 'OFFLINE'}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 px-3 rounded-lg transition"
                    style={{ background: syncing === d.id ? '#f3e5f5' : '#7b1fa2', color: syncing === d.id ? '#7b1fa2' : 'white' }}
                  >
                    <span className={`material-icons-round text-sm ${syncing === d.id ? 'animate-spin' : ''}`}>sync</span>
                    {syncing === d.id ? '…' : 'قراءة ZK'}
                  </button>
                  <button
                    onClick={() => navigate(`/devices/edit/${d.id}`)}
                    className="px-3 py-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition"
                  >
                    <span className="material-icons-round text-sm">edit</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* Add device card */}
        <button
          onClick={() => navigate('/devices/add')}
          className="border-2 border-dashed border-gray-200 rounded-xl p-5 flex flex-col items-center justify-center gap-3 text-gray-400 hover:border-brand/50 hover:text-brand/60 hover:bg-brand/5 transition-all min-h-[200px]"
        >
          <span className="material-icons-round text-4xl">add_circle_outline</span>
          <span className="text-sm font-medium">{t('device.add')}</span>
        </button>
      </div>
    </div>
  );
}
