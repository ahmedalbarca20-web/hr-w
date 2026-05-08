import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { headcountReport, leaveReport, payrollReport } from '../../api/report.api';
import { useCurrency } from '../../context/CurrencyContext';

const REPORT_CARDS = [
  {
    title: 'Attendance Report',
    title_ar: 'تقرير الحضور',
    desc: 'Daily, weekly and monthly attendance summary with late/absent breakdown.',
    icon: 'access_time',
    gradient: 'linear-gradient(135deg,#42424a,#191919)',
    tags: ['Daily', 'Monthly', 'Export'],
    path: '/attendance',
  },
  {
    title: 'Leave Report',
    title_ar: 'تقرير الإجازات',
    desc: 'Leave balances, usage and pending approval status for all employees.',
    icon: 'event_note',
    gradient: 'linear-gradient(135deg,#26c6da,#0097a7)',
    tags: ['Balance', 'By Type', 'Export'],
    path: '/leaves',
  },
  {
    title: 'Payroll Report',
    title_ar: 'تقرير الرواتب',
    desc: 'Monthly payroll runs, net salaries, deductions and allowances.',
    icon: 'payments',
    gradient: 'linear-gradient(135deg,#ffa726,#f57c00)',
    tags: ['Monthly', 'Payslip', 'Export'],
    path: '/payroll',
  },
  {
    title: 'Employee Report',
    title_ar: 'تقرير الموظفين',
    desc: 'Headcount, department distribution, new hires and terminations.',
    icon: 'group',
    gradient: 'linear-gradient(135deg,#66bb6a,#388e3c)',
    tags: ['Headcount', 'By Dept', 'Export'],
    path: '/employees',
  },
  {
    title: 'Biometric Sync Report',
    title_ar: 'تقرير التزامن البيومتري',
    desc: 'Device sync history, raw punch logs and anomaly detection.',
    icon: 'fingerprint',
    gradient: 'linear-gradient(135deg,#ab47bc,#7b1fa2)',
    tags: ['Sync Logs', 'Devices', 'Export'],
    path: '/devices/logs',
  },
  {
    title: 'Overtime Report',
    title_ar: 'تقرير الوقت الإضافي',
    desc: 'Overtime hours logged per employee and department for the selected period.',
    icon: 'more_time',
    gradient: 'linear-gradient(135deg,#ef5350,#c62828)',
    tags: ['Hours', 'By Dept', 'Export'],
    path: '/attendance',
  },
];

export default function Reports() {
  const navigate = useNavigate();
  const { fmt }  = useCurrency();
  const now      = new Date();
  const year     = now.getFullYear();
  const month    = now.getMonth() + 1;

  const [summary, setSummary] = useState(null);

  useEffect(() => {
    Promise.allSettled([
      headcountReport({ year, month }),
      leaveReport({ year, month }),
      payrollReport({ year, month }),
    ]).then(([hc, lv, pay]) => {
      setSummary({
        total_employees: hc.value?.data?.data?.total_employees ?? '—',
        leaves_this_month: lv.value?.data?.data?.total_days ?? '—',
        payroll_total: pay.value?.data?.data?.total_net ?? '—',
      });
    });
  }, [year, month]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-card px-6 py-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#ab47bc,#7b1fa2)' }}>
          <span className="material-icons-round text-white text-xl">bar_chart</span>
        </div>
        <div>
          <h1 className="font-bold text-gray-800 text-lg">Reports Center</h1>
          <p className="text-sm text-gray-400 mt-0.5">Generate and export HR reports</p>
        </div>
      </div>

      {/* Quick stats */}
      {summary && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total Employees',    value: summary.total_employees,   icon: 'group',      color: '#7b1fa2' },
            { label: 'Leave Days (Month)', value: summary.leaves_this_month, icon: 'event_note', color: '#0097a7' },
            { label: 'Net Payroll (Month)',value: summary.payroll_total != null ? fmt(summary.payroll_total) : '—', icon: 'payments', color: '#f57c00' },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl shadow-card p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center" style={{ background: s.color + '15' }}>
                <span className="material-icons-round text-xl" style={{ color: s.color }}>{s.icon}</span>
              </div>
              <div>
                <p className="text-xl font-bold text-gray-800">{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Report cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {REPORT_CARDS.map((r) => (
          <div
            key={r.title}
            className="bg-white rounded-xl shadow-card overflow-hidden hover:shadow-card-lg transition-shadow cursor-pointer group"
            onClick={() => navigate(r.path)}
          >
            {/* Gradient header */}
            <div className="px-5 py-4 text-white" style={{ background: r.gradient }}>
              <div className="flex items-center gap-3 mb-2">
                <span className="material-icons-round text-white/90 text-2xl">{r.icon}</span>
                <div>
                  <p className="font-bold text-base">{r.title}</p>
                  <p className="text-white/60 text-xs">{r.title_ar}</p>
                </div>
              </div>
            </div>

            <div className="px-5 py-4">
              <p className="text-sm text-gray-500 leading-relaxed mb-4">{r.desc}</p>
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-1.5">
                  {r.tags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-[11px] font-medium">{tag}</span>
                  ))}
                </div>
                <span className="material-icons-round text-gray-300 group-hover:text-brand transition-colors text-xl">arrow_forward</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

