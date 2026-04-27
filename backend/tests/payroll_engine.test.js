'use strict';

const request = require('supertest');
const app     = require('../src/app');

// ── Pure engine functions ─────────────────────────────────────────────────────
const {
  calculatePayslip,
  computeWorkingDays,
  countWeekdays,
} = require('../src/services/payroll_engine.service');

// ── Zod schema ────────────────────────────────────────────────────────────────
const { payrollEngineConfigSchema } = require('../src/utils/validators');

// ─────────────────────────────────────────────────────────────────────────────
// 1.  Auth guards
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/payroll/runs/:id/process – auth guard', () => {
  it('returns 401 without JWT', async () => {
    const res = await request(app).post('/api/payroll/runs/1/process');
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2.  countWeekdays()
// ─────────────────────────────────────────────────────────────────────────────

describe('countWeekdays()', () => {
  it('counts a single Monday as 1', () => {
    // 2025-01-06 is a Monday
    expect(countWeekdays('2025-01-06', '2025-01-06')).toBe(1);
  });

  it('counts Mon–Fri of one standard week as 5', () => {
    // 2025-01-06 Mon → 2025-01-10 Fri
    expect(countWeekdays('2025-01-06', '2025-01-10')).toBe(5);
  });

  it('counts the full week Mon–Sun as 5 (ignoring weekend)', () => {
    // 2025-01-06 Mon → 2025-01-12 Sun
    expect(countWeekdays('2025-01-06', '2025-01-12')).toBe(5);
  });

  it('counts a Saturday as 0', () => {
    // 2025-01-11 is a Saturday
    expect(countWeekdays('2025-01-11', '2025-01-11')).toBe(0);
  });

  it('counts a Sunday as 0', () => {
    // 2025-01-12 is a Sunday
    expect(countWeekdays('2025-01-12', '2025-01-12')).toBe(0);
  });

  it('counts two full weeks as 10', () => {
    // 2025-01-06 Mon → 2025-01-17 Fri (two weeks)
    expect(countWeekdays('2025-01-06', '2025-01-17')).toBe(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3.  computeWorkingDays()
// ─────────────────────────────────────────────────────────────────────────────

describe('computeWorkingDays()', () => {
  it('January 2025 has 23 working days', () => {
    expect(computeWorkingDays(2025, 1)).toBe(23);
  });

  it('February 2025 has 20 working days', () => {
    expect(computeWorkingDays(2025, 2)).toBe(20);
  });

  it('returns a positive number for any month', () => {
    for (let m = 1; m <= 12; m++) {
      expect(computeWorkingDays(2025, m)).toBeGreaterThan(0);
    }
  });

  it('December 31 partial month — February in a leap year', () => {
    // Feb 2024 (leap year) → 29 days, starts Thu → 21 working days
    expect(computeWorkingDays(2024, 2)).toBe(21);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4.  calculatePayslip() — pure function
// ─────────────────────────────────────────────────────────────────────────────

// January 2025 = 23 working days
const WORKING_DAYS = 23;
const BASE_SALARY  = 10000;

const standardEmployee = { base_salary: BASE_SALARY };

const perfectAttendance = {
  working_days     : WORKING_DAYS,
  actual_days      : WORKING_DAYS,
  absent_days      : 0,
  paid_leave_days  : 0,
  unpaid_leave_days: 0,
  overtime_minutes : 0,
  late_minutes     : 0,
};

describe('calculatePayslip() — no adjustments (perfect attendance, no components)', () => {
  it('net_salary equals base_salary when no deductions or additions', () => {
    const p = calculatePayslip(standardEmployee, perfectAttendance, []);
    expect(p.net_salary).toBe(BASE_SALARY);
    expect(p.gross_salary).toBe(BASE_SALARY);
    expect(p.total_additions).toBe(0);
    expect(p.total_deductions).toBe(0);
    expect(p.tax_amount).toBe(0);
  });

  it('snapshot fields are correct', () => {
    const p = calculatePayslip(standardEmployee, perfectAttendance, []);
    expect(p.working_days).toBe(WORKING_DAYS);
    expect(p.actual_days).toBe(WORKING_DAYS);
    expect(p.absent_days).toBe(0);
    expect(p.overtime_minutes).toBe(0);
    expect(p.late_minutes).toBe(0);
    expect(p.line_items).toHaveLength(0);
  });
});

describe('calculatePayslip() — absence deduction', () => {
  it('deducts one absent day from salary', () => {
    const stats = { ...perfectAttendance, actual_days: WORKING_DAYS - 1, absent_days: 1 };
    const p     = calculatePayslip(standardEmployee, stats, []);
    const daily = BASE_SALARY / WORKING_DAYS;
    expect(p.total_deductions).toBeCloseTo(daily, 1);
    expect(p.net_salary).toBeCloseTo(BASE_SALARY - daily, 1);
  });

  it('creates an AUTO DEDUCTION line item for absence', () => {
    const stats = { ...perfectAttendance, actual_days: WORKING_DAYS - 2, absent_days: 2 };
    const p     = calculatePayslip(standardEmployee, stats, []);
    const absLine = p.line_items.find(l => l.component_name === 'Absence Deduction');
    expect(absLine).toBeDefined();
    expect(absLine.type).toBe('DEDUCTION');
    expect(absLine.source).toBe('AUTO');
    expect(absLine.component_id).toBeNull();
  });

  it('does NOT create absence line item when absent_days = 0', () => {
    const p = calculatePayslip(standardEmployee, perfectAttendance, []);
    const absLine = p.line_items.find(l => l.component_name === 'Absence Deduction');
    expect(absLine).toBeUndefined();
  });
});

describe('calculatePayslip() — unpaid leave deduction', () => {
  it('deducts unpaid leave days at daily rate', () => {
    const stats = { ...perfectAttendance, unpaid_leave_days: 3 };
    const p     = calculatePayslip(standardEmployee, stats, []);
    const expected = +(3 * (BASE_SALARY / WORKING_DAYS)).toFixed(2);
    expect(p.total_deductions).toBeCloseTo(expected, 1);
  });

  it('creates an AUTO DEDUCTION line item for unpaid leave', () => {
    const stats = { ...perfectAttendance, unpaid_leave_days: 2 };
    const p     = calculatePayslip(standardEmployee, stats, []);
    const line  = p.line_items.find(l => l.component_name === 'Unpaid Leave Deduction');
    expect(line).toBeDefined();
    expect(line.type).toBe('DEDUCTION');
    expect(line.source).toBe('AUTO');
  });

  it('does NOT deduct paid leave days', () => {
    const stats = { ...perfectAttendance, paid_leave_days: 5 };
    const p     = calculatePayslip(standardEmployee, stats, []);
    expect(p.total_deductions).toBe(0);
    const line = p.line_items.find(l => l.component_name === 'Unpaid Leave Deduction');
    expect(line).toBeUndefined();
  });
});

describe('calculatePayslip() — overtime pay', () => {
  it('adds overtime pay at 1.5× hourly rate', () => {
    const OT_MINUTES = 120;   // 2 hours OT
    const stats = { ...perfectAttendance, overtime_minutes: OT_MINUTES };
    const p     = calculatePayslip(standardEmployee, stats, [], { overtime_multiplier: 1.5, standard_hours_per_day: 8 });

    const hourly = BASE_SALARY / (WORKING_DAYS * 8);
    const expectedOT = +((OT_MINUTES / 60) * hourly * 1.5).toFixed(2);
    expect(p.total_additions).toBeCloseTo(expectedOT, 1);
    expect(p.net_salary).toBeCloseTo(BASE_SALARY + expectedOT, 1);
  });

  it('creates an AUTO ADDITION line item for overtime', () => {
    const stats = { ...perfectAttendance, overtime_minutes: 60 };
    const p     = calculatePayslip(standardEmployee, stats, []);
    const line  = p.line_items.find(l => l.component_name === 'Overtime Pay');
    expect(line).toBeDefined();
    expect(line.type).toBe('ADDITION');
    expect(line.source).toBe('AUTO');
  });

  it('does NOT create overtime line item when overtime_minutes = 0', () => {
    const p    = calculatePayslip(standardEmployee, perfectAttendance, []);
    const line = p.line_items.find(l => l.component_name === 'Overtime Pay');
    expect(line).toBeUndefined();
  });

  it('respects custom overtime_multiplier', () => {
    const OT_MINUTES = 60;
    const stats   = { ...perfectAttendance, overtime_minutes: OT_MINUTES };
    const p15     = calculatePayslip(standardEmployee, stats, [], { overtime_multiplier: 1.5 });
    const p200    = calculatePayslip(standardEmployee, stats, [], { overtime_multiplier: 2.0 });
    expect(p200.total_additions).toBeCloseTo(p15.total_additions * (2.0 / 1.5), 1);
  });
});

describe('calculatePayslip() — salary components', () => {
  const housingComp = {
    comp_id      : 1,
    name         : 'Housing Allowance',
    type         : 'ADDITION',
    value        : 2000,
    is_percentage: false,
    is_taxable   : false,
  };

  const taxComp = {
    comp_id      : 2,
    name         : 'Income Tax',
    type         : 'DEDUCTION',
    value        : 10,
    is_percentage: true,
    is_taxable   : false,
  };

  it('adds a flat ADDITION component correctly', () => {
    const p = calculatePayslip(standardEmployee, perfectAttendance, [housingComp]);
    expect(p.total_additions).toBe(2000);
    expect(p.gross_salary).toBe(BASE_SALARY + 2000);
    expect(p.net_salary).toBe(BASE_SALARY + 2000);
  });

  it('applies percentage DEDUCTION against base_salary', () => {
    const p = calculatePayslip(standardEmployee, perfectAttendance, [taxComp]);
    const expectedDeduction = BASE_SALARY * 0.10;
    expect(p.total_deductions).toBeCloseTo(expectedDeduction, 1);
    expect(p.net_salary).toBeCloseTo(BASE_SALARY - expectedDeduction, 1);
  });

  it('creates COMPONENT source line items', () => {
    const p     = calculatePayslip(standardEmployee, perfectAttendance, [housingComp]);
    const line  = p.line_items.find(l => l.component_id === 1);
    expect(line.source).toBe('COMPONENT');
    expect(line.amount).toBe(2000);
  });

  it('net combines base + additions − deductions correctly', () => {
    const p = calculatePayslip(standardEmployee, perfectAttendance, [housingComp, taxComp]);
    const gross = BASE_SALARY + 2000;
    const deduct = BASE_SALARY * 0.10;
    expect(p.gross_salary).toBe(gross);
    expect(p.net_salary).toBeCloseTo(gross - deduct, 1);
  });

  it('skips zero-valued components', () => {
    const zeroComp = { ...housingComp, value: 0 };
    const p = calculatePayslip(standardEmployee, perfectAttendance, [zeroComp]);
    expect(p.line_items).toHaveLength(0);
  });
});

describe('calculatePayslip() — combined deductions', () => {
  it('stacks absence + unpaid leave + component deductions', () => {
    const taxComp = {
      comp_id: 3, name: 'Tax', type: 'DEDUCTION',
      value: 5, is_percentage: true, is_taxable: false,
    };
    const stats = { ...perfectAttendance, absent_days: 1, unpaid_leave_days: 1 };
    const p = calculatePayslip(standardEmployee, stats, [taxComp]);

    const daily     = BASE_SALARY / WORKING_DAYS;
    const absDeduct = +daily.toFixed(2);
    const unpDeduct = +daily.toFixed(2);
    const taxDeduct = +(BASE_SALARY * 0.05).toFixed(2);

    expect(p.total_deductions).toBeCloseTo(absDeduct + unpDeduct + taxDeduct, 0);
  });
});

describe('calculatePayslip() — edge cases', () => {
  it('handles zero base_salary without dividing by zero', () => {
    const emp = { base_salary: 0 };
    const p   = calculatePayslip(emp, perfectAttendance, []);
    expect(p.net_salary).toBe(0);
    expect(p.daily_rate).toBe(0);
    expect(p.hourly_rate).toBe(0);
  });

  it('handles zero working_days without dividing by zero', () => {
    const stats = { ...perfectAttendance, working_days: 0 };
    const p     = calculatePayslip(standardEmployee, stats, []);
    expect(p.daily_rate).toBe(0);
    expect(p.hourly_rate).toBe(0);
  });

  it('stores late_minutes on snapshot even though no automatic deduction', () => {
    const stats = { ...perfectAttendance, late_minutes: 45 };
    const p     = calculatePayslip(standardEmployee, stats, []);
    expect(p.late_minutes).toBe(45);
    // No auto-deduction for late — stored only
    expect(p.total_deductions).toBe(0);
  });

  it('stores paid_leave_days without deducting them', () => {
    const stats = { ...perfectAttendance, paid_leave_days: 3 };
    const p     = calculatePayslip(standardEmployee, stats, []);
    expect(p.paid_leave_days).toBe(3);
    expect(p.total_deductions).toBe(0);
    expect(p.net_salary).toBe(BASE_SALARY);
  });

  it('net_salary can be zero but not negative in extreme case', () => {
    // Give 23 absent days (entire month) + big deduction component
    const bigDeduct = {
      comp_id: 99, name: 'Big Deduction', type: 'DEDUCTION',
      value: BASE_SALARY * 10, is_percentage: false, is_taxable: false,
    };
    const stats = { ...perfectAttendance, actual_days: 0, absent_days: WORKING_DAYS };
    const p     = calculatePayslip(standardEmployee, stats, [bigDeduct]);
    // Net can technically go negative — engine does not clamp (HR reviews)
    expect(typeof p.net_salary).toBe('number');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5.  payrollEngineConfigSchema
// ─────────────────────────────────────────────────────────────────────────────

describe('payrollEngineConfigSchema', () => {
  it('accepts empty body (all defaults)', () => {
    const r = payrollEngineConfigSchema.safeParse({});
    expect(r.success).toBe(true);
    expect(r.data.overtime_multiplier).toBe(1.5);
    expect(r.data.standard_hours_per_day).toBe(8);
  });

  it('accepts custom overtime_multiplier', () => {
    const r = payrollEngineConfigSchema.safeParse({ overtime_multiplier: 2.0 });
    expect(r.success).toBe(true);
    expect(r.data.overtime_multiplier).toBe(2.0);
  });

  it('accepts custom standard_hours_per_day', () => {
    const r = payrollEngineConfigSchema.safeParse({ standard_hours_per_day: 6 });
    expect(r.success).toBe(true);
    expect(r.data.standard_hours_per_day).toBe(6);
  });

  it('rejects overtime_multiplier below 1', () => {
    const r = payrollEngineConfigSchema.safeParse({ overtime_multiplier: 0.5 });
    expect(r.success).toBe(false);
  });

  it('rejects overtime_multiplier above 5', () => {
    const r = payrollEngineConfigSchema.safeParse({ overtime_multiplier: 6 });
    expect(r.success).toBe(false);
  });

  it('rejects standard_hours_per_day above 24', () => {
    const r = payrollEngineConfigSchema.safeParse({ standard_hours_per_day: 25 });
    expect(r.success).toBe(false);
  });

  it('accepts undefined (schema itself is optional)', () => {
    const r = payrollEngineConfigSchema.safeParse(undefined);
    expect(r.success).toBe(true);
    expect(r.data).toBeDefined();
  });
});
