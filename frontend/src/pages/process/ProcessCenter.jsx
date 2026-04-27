import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import { processAll, processEmployee, reprocess } from '../../api/process.api';

function ResultTable({ results }) {
  if (!results?.length) return null;
  return (
    <div className="overflow-x-auto mt-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50">
            <th className="text-left p-2">Employee</th>
            <th className="text-left p-2">Date</th>
            <th className="text-left p-2">Status</th>
            <th className="text-left p-2">Total Hours</th>
            <th className="text-left p-2">Overtime</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => (
            <tr key={i} className="border-t">
              <td className="p-2">{r.employee_id}</td>
              <td className="p-2">{r.work_date}</td>
              <td className="p-2">{r.status}</td>
              <td className="p-2">{r.total_minutes ? `${Math.round(r.total_minutes / 60 * 10) / 10}h` : '—'}</td>
              <td className="p-2">{r.overtime_minutes ? `${r.overtime_minutes}m` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ProcessCenter() {
  const { t } = useTranslation();

  const [date, setDate]           = useState(new Date().toISOString().slice(0, 10));
  const [dateTo, setDateTo]       = useState('');
  const [empId, setEmpId]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [alert, setAlert]         = useState(null);
  const [results, setResults]     = useState(null);

  const run = async (mode) => {
    setLoading(true);
    setAlert(null);
    setResults(null);
    try {
      let res;
      if (mode === 'all') {
        res = await processAll({ date_from: date, date_to: dateTo || date });
      } else if (mode === 'employee') {
        res = await processEmployee(empId, { date_from: date, date_to: dateTo || date });
      } else {
        res = await reprocess({ date_from: date, date_to: dateTo || date });
      }
      const rows = res.data?.data?.processed || res.data?.data || [];
      setResults(Array.isArray(rows) ? rows : []);
      setAlert({ type: 'success', msg: `${t('process.done')} — ${Array.isArray(rows) ? rows.length : '?'} records` });
    } catch (e) {
      setAlert({ type: 'danger', msg: e.response?.data?.error || 'Processing failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto w-full">
      {alert && <Alert type={alert.type} message={alert.msg} onClose={() => setAlert(null)} />}

      <div className="md-card" style={{ overflow: 'visible' }}>
        <div
          className="rounded-xl mx-4 -mt-4 p-4 shadow-card-lg mb-6"
          style={{ background: 'linear-gradient(195deg, #f4511e, #b71c1c)' }}
        >
          <h2 className="text-white font-semibold">{t('process.title')}</h2>
          <p className="text-white/75 text-sm mt-1">{t('process.subtitle')}</p>
        </div>

        <div className="px-6 pb-6 space-y-6">
          {/* Date range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">{t('process.date_from')}</label>
              <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="label">{t('process.date_to')} <span className="text-gray-400 text-xs">({t('process.optional')})</span></label>
              <input type="date" className="input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>

          {/* All employees */}
          <div className="border rounded-xl p-4 space-y-3">
            <h3 className="font-semibold text-gray-700">{t('process.all_employees')}</h3>
            <p className="text-sm text-gray-500">{t('process.all_desc')}</p>
            <div className="flex gap-3">
              <Button icon="play_arrow" loading={loading} onClick={() => run('all')}>{t('process.run_all')}</Button>
              <Button icon="replay" variant="outline" loading={loading} onClick={() => run('reprocess')}>{t('process.reprocess')}</Button>
            </div>
          </div>

          {/* Single employee */}
          <div className="border rounded-xl p-4 space-y-3">
            <h3 className="font-semibold text-gray-700">{t('process.single_employee')}</h3>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="label">{t('process.employee_id')}</label>
                <input
                  type="number"
                  className="input"
                  placeholder="Employee ID"
                  value={empId}
                  onChange={(e) => setEmpId(e.target.value)}
                />
              </div>
              <Button icon="person_search" loading={loading} disabled={!empId} onClick={() => run('employee')}>
                {t('process.run_single')}
              </Button>
            </div>
          </div>

          {/* Results */}
          {results !== null && (
            <div>
              <h3 className="font-semibold text-gray-700 mb-2">{t('process.results')} ({results.length})</h3>
              {results.length > 0 ? <ResultTable results={results} /> : (
                <p className="text-gray-500 text-sm">{t('common.no_data')}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
