import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getRun, getItem } from '../../api/payroll.api';
import Button from '../../components/common/Button';
import Alert from '../../components/common/Alert';
import { useCurrency } from '../../context/CurrencyContext';

function SlipRow({ label, value, bold }) {
  return (
    <div className={`flex justify-between py-1.5 border-b last:border-0 ${bold ? 'font-bold' : ''}`}>
      <span className={bold ? '' : 'text-gray-500 text-sm'}>{label}</span>
      <span className={bold ? 'text-lg' : 'text-sm'}>{value}</span>
    </div>
  );
}

export default function PayrollSlip() {
  const { run_id, id } = useParams();
  const navigate       = useNavigate();
  const { t }          = useTranslation();
  const { fmt: fmtCurrency } = useCurrency();

  const [run,     setRun]     = useState(null);
  const [slip,    setSlip]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [alert,   setAlert]   = useState(null);

  useEffect(() => {
    Promise.all([getRun(run_id), getItem(run_id, id)])
      .then(([runRes, slipRes]) => {
        setRun(runRes.data?.data);
        setSlip(slipRes.data?.data);
      })
      .catch((e) => setAlert({ type: 'danger', msg: e.response?.data?.error || 'Failed to load payslip' }))
      .finally(() => setLoading(false));
  }, [run_id, id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400">
        <span className="material-icons-round animate-spin text-4xl">sync</span>
      </div>
    );
  }

  const fmt = (n) => n != null ? Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00';

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.msg} onClose={() => setAlert(null)} />}

      <div className="flex gap-3 print:hidden">
        <Button icon="arrow_back" variant="outline" onClick={() => navigate(-1)}>
          {t('common.back', 'Back')}
        </Button>
        <Button icon="print" onClick={() => window.print()}>
          {t('common.print', 'Print')}
        </Button>
      </div>

      {slip && (
        <div className="md-card p-8 max-w-2xl mx-auto print:shadow-none print:border print:border-gray-200">
          {/* Header */}
          <div
            className="rounded-xl px-6 py-4 mb-6 text-white text-center print:bg-gray-800"
            style={{ background: 'linear-gradient(195deg, #ffa726, #ef6c00)' }}
          >
            <h1 className="text-2xl font-bold">{t('payroll.payslip', 'Pay Slip')}</h1>
            <p className="text-white/80 text-sm mt-1">
              {run?.name || `Run #${run_id}`} · {run?.pay_period_start} – {run?.pay_period_end}
            </p>
          </div>

          {/* Employee info */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{t('employee.name', 'Employee')}</p>
              <p className="font-semibold">
                {slip.Employee
                  ? `${slip.Employee.first_name} ${slip.Employee.last_name}`
                  : `#${slip.employee_id}`}
              </p>
              <p className="text-sm text-gray-500">{slip.Employee?.employee_number}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{t('employee.department', 'Department')}</p>
              <p className="font-semibold">{slip.Employee?.Department?.name || '—'}</p>
              <p className="text-sm text-gray-500">{slip.Employee?.contract_type}</p>
            </div>
          </div>

          <hr className="mb-4" />

          {/* Earnings */}
          <h3 className="font-semibold text-gray-700 mb-2">{t('payroll.earnings', 'Earnings')}</h3>
          <div className="mb-4 bg-green-50 rounded-lg p-3">
            <SlipRow label={t('payroll.base_salary', 'Base Salary')} value={fmtCurrency(slip.base_salary)} />
            {slip.additions?.map((a, i) => (
              <SlipRow key={i} label={a.name} value={fmtCurrency(a.amount)} />
            ))}
            <SlipRow label={t('payroll.overtime_pay', 'Overtime Pay')} value={fmtCurrency(slip.overtime_amount)} />
          </div>

          {/* Deductions */}
          <h3 className="font-semibold text-gray-700 mb-2">{t('payroll.deductions', 'Deductions')}</h3>
          <div className="mb-4 bg-red-50 rounded-lg p-3">
            {slip.deductions?.map((d, i) => (
              <SlipRow key={i} label={d.name} value={`- ${fmtCurrency(d.amount)}`} />
            ))}
            {(!slip.deductions?.length) && (
              <p className="text-gray-400 text-sm">{t('payroll.no_deductions', 'No deductions')}</p>
            )}
          </div>

          <hr className="mb-4" />

          {/* Net pay */}
          <div className="bg-orange-50 rounded-xl p-4">
            <SlipRow label={t('payroll.gross_pay', 'Gross Pay')} value={fmtCurrency(slip.gross_salary)} />
            <SlipRow label={t('payroll.total_deductions', 'Total Deductions')} value={`- ${fmtCurrency(slip.total_deductions)}`} />
            <SlipRow label={t('payroll.net_pay', 'Net Pay')} value={fmtCurrency(slip.net_salary)} bold />
          </div>

          {/* Status badge */}
          <div className="mt-4 text-right text-xs text-gray-400">
            {t('payroll.status', 'Status')}: <span className="font-semibold text-gray-600">{slip.status}</span>
          </div>
        </div>
      )}
    </div>
  );
}

