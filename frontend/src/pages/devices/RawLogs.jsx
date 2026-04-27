import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { listLogs } from '../../api/device.api';

const PAGE_SIZE = 20;

/** Sort keys for raw log table (current page only). */
const SORT_KEYS = ['id', 'event_time', 'user', 'event_type', 'device', 'processed'];

function sortComparable(log, key) {
  switch (key) {
    case 'id':
      return Number(log.id) || 0;
    case 'event_time':
      return new Date(log.event_time).getTime() || 0;
    case 'user': {
      const e = log.employee;
      const name = e
        ? `${e.last_name || ''} ${e.first_name || ''} ${e.employee_number || ''}`.trim()
        : '';
      const zkName = String(log.raw_payload?.zk_display_name || '').trim();
      return `${name} ${zkName} ${String(log.card_number || '').trim()}`.trim().toLowerCase();
    }
    case 'event_type':
      return String(log.event_type || '').toLowerCase();
    case 'device':
      return String(log.device?.name || `#${log.device_id || ''}`).toLowerCase();
    case 'processed':
      return Number(log.processed) ? 1 : 0;
    default:
      return 0;
  }
}

const TYPE_CFG = {
  CHECK_IN:  { bg: '#e8f5e9', text: '#2e7d32', label: 'Check In'  },
  CHECK_OUT: { bg: '#e3f2fd', text: '#1565c0', label: 'Check Out' },
  VERIFY:    { bg: '#f3e5f5', text: '#7b1fa2', label: 'Verify'    },
  ALARM:     { bg: '#ffebee', text: '#c62828', label: 'Alarm'     },
  OTHER:     { bg: '#f5f5f5', text: '#616161', label: 'Other'     },
};

export default function RawLogs() {
  const { t }    = useTranslation();
  const [logs,   setLogs]   = useState([]);
  const [total,  setTotal]  = useState(0);
  const [page,   setPage]   = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(false);
  /** Client-side sort on the loaded page (same UX as other tables). */
  const [sort, setSort] = useState({ key: 'event_time', dir: 'desc' });

  const toggleSort = (key) => {
    if (!SORT_KEYS.includes(key)) return;
    setSort((prev) => {
      if (prev.key !== key) {
        const defaultDir = key === 'event_time' || key === 'id' ? 'desc' : 'asc';
        return { key, dir: defaultDir };
      }
      return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
    });
  };

  const sortedLogs = useMemo(() => {
    if (!Array.isArray(logs) || logs.length === 0) return logs;
    const { key, dir } = sort;
    const factor = dir === 'asc' ? 1 : -1;
    return [...logs].sort((a, b) => {
      const va = sortComparable(a, key);
      const vb = sortComparable(b, key);
      if (va < vb) return -1 * factor;
      if (va > vb) return 1 * factor;
      return 0;
    });
  }, [logs, sort]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: PAGE_SIZE };
      if (search)     params.card_number = search;
      if (typeFilter) params.event_type  = typeFilter;
      const { data } = await listLogs(params);
      const payload = data?.data;
      const rows = Array.isArray(payload?.data) ? payload.data : payload?.logs || [];
      const count = payload?.meta?.total ?? payload?.total ?? rows.length;
      setLogs(rows);
      setTotal(Number(count) || 0);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, typeFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleFilter = (fn) => { fn(); setPage(1); };
  const totalPages   = Math.ceil(total / PAGE_SIZE);

  const checkIns  = logs.filter((l) => l.event_type === 'CHECK_IN').length;
  const checkOuts = logs.filter((l) => l.event_type === 'CHECK_OUT').length;
  const surpriseLogs = logs.filter((l) => Number(l.is_surprise) === 1 || l.raw_payload?.surprise_attendance?.is_surprise).length;

  const sortHeader = (key, label) => {
    const active = sort.key === key;
    const Icon = active ? (
      <span className="material-icons-round text-sm align-middle">
        {sort.dir === 'asc' ? 'north' : 'south'}
      </span>
    ) : null;
    return (
      <th
        className="th cursor-pointer select-none"
        onClick={() => toggleSort(key)}
        title={t('common.click_to_sort')}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {Icon}
        </span>
      </th>
    );
  };

  return (
    <div className="space-y-5">
      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Logs',  value: total,      color: '#7b1fa2', icon: 'receipt_long' },
          { label: 'Check Ins',   value: checkIns,   color: '#388e3c', icon: 'login'        },
          { label: 'Check Outs',  value: checkOuts,  color: '#1565c0', icon: 'logout'       },
          { label: 'Surprise',    value: surpriseLogs, color: '#d81b60', icon: 'priority_high' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl shadow-card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: s.color + '18' }}>
              <span className="material-icons-round text-xl" style={{ color: s.color }}>{s.icon}</span>
            </div>
            <div>
              <p className="text-xl font-bold text-gray-800">{s.value}</p>
              <p className="text-xs text-gray-400">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-card px-5 py-4 flex flex-wrap items-center gap-3">
        <div className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          تنبيه: أي بصمة خارج نافذة تسجيل الدخول/الخروج المحددة في الدوام قد يتم تجاهلها في احتساب الحضور.
        </div>
        <div className="relative flex-1 min-w-44">
          <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">search</span>
          <input
            value={search}
            onChange={(e) => handleFilter(() => setSearch(e.target.value))}
            placeholder="Search by biometric number…"
            className="input pl-9"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => handleFilter(() => setTypeFilter(e.target.value))}
          className="input w-40"
        >
          <option value="">All Types</option>
          <option value="CHECK_IN">Check In</option>
          <option value="CHECK_OUT">Check Out</option>
          <option value="VERIFY">Verify</option>
          <option value="ALARM">Alarm</option>
          <option value="OTHER">Other</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800">{t('device.raw_logs', 'Raw Device Logs')}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{total} records</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-400">
            <span className="material-icons-round animate-spin text-3xl">sync</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  {sortHeader('id', '#')}
                  {sortHeader('event_time', t('device.log_date', 'Time'))}
                  {sortHeader('user', t('device.log_user', 'Biometric #'))}
                  {sortHeader('event_type', t('device.log_type', 'Type'))}
                  {sortHeader('device', t('device.log_device', 'Device'))}
                  {sortHeader('processed', t('device.log_processed'))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="td text-center text-gray-400 py-12">
                      <span className="material-icons-round text-4xl block mb-2 text-gray-200">receipt_long</span>
                      No logs found
                    </td>
                  </tr>
                )}
                {sortedLogs.map((log) => {
                  const tc = TYPE_CFG[log.event_type] || TYPE_CFG.OTHER;
                  return (
                    <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="td text-xs text-gray-400 font-mono">{log.id}</td>
                      <td
                        className="td font-mono text-xs text-gray-700 cursor-pointer select-none"
                        onClick={() => toggleSort('event_time')}
                        title={t('common.click_to_sort')}
                      >
                        {log.event_time ? new Date(log.event_time).toLocaleString() : '—'}
                      </td>
                      <td
                        className="td cursor-pointer select-none"
                        onClick={() => toggleSort('user')}
                        title={t('common.click_to_sort')}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <span className="material-icons-round text-gray-400 text-base">badge</span>
                          <span className="font-semibold text-gray-800 font-mono text-xs">{log.card_number}</span>
                        </span>
                        {log.raw_payload?.zk_display_name && (
                          <div className="text-[11px] text-gray-600 mt-1" dir="auto" title={t('device.zk_display_name', 'Name on device')}>
                            {log.raw_payload.zk_display_name}
                          </div>
                        )}
                        {log.employee?.employee_number && (
                          <div className="text-[11px] text-gray-400 mt-1">
                            {log.employee.first_name} {log.employee.last_name}
                          </div>
                        )}
                      </td>
                      <td className="td">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{ background: tc.bg, color: tc.text }}>
                            {tc.label}
                          </span>
                          {(Number(log.is_surprise) === 1 || log.raw_payload?.surprise_attendance?.is_surprise) && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-pink-100 text-pink-700">
                              Surprise
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="td hidden md:table-cell text-xs text-gray-500">
                        {log.device?.name || `#${log.device_id}`}
                      </td>
                      <td className="td hidden lg:table-cell">
                        {log.processed ? (
                          <span className="text-xs text-green-600 font-semibold">✓ Yes</span>
                        ) : (
                          <span className="text-xs text-gray-400">Pending</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-400">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="btn-ghost px-3 py-1.5 text-xs disabled:opacity-40">
                <span className="material-icons-round text-base">chevron_left</span>
              </button>
              <span className="px-3 py-1.5 text-xs text-gray-600 font-semibold">{page} / {totalPages}</span>
              <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} className="btn-ghost px-3 py-1.5 text-xs disabled:opacity-40">
                <span className="material-icons-round text-base">chevron_right</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
