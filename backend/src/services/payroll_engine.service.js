'use strict';

/**
 * Payroll Engine
 * ==============
 *
 * Computes a monthly payroll snapshot for every active employee.
 * Data is FROZEN at calculation time — re-running via `processRun` creates a
 * fresh snapshot, but previously APPROVED / PAID runs are protected.
 *
 * Calculation components
 * ──────────────────────
 *  1. Attendance stats          – from `attendance` table (read-only)
 *  2. Approved leaves           – from `leave_requests` (paid vs unpaid)
 *  3. Overtime pay              – AUTO line item (ADDITION)
 *  4. Absence deduction         – AUTO line item (DEDUCTION)
 *  5. Unpaid-leave deduction    – AUTO line item (DEDUCTION)
 *  6. Salary components         – COMPONENT line items (per SalaryComponent rows)
 *
 * net_salary = base_salary + total_additions − total_deductions
 *
 * None of the source tables (attendance, leaves, device_logs) are mutated.
 */

const { Op, literal } = require('sequelize');
const sequelize = require('../config/db').sequelize;

const Employee    = require('../models/employee.model');
const Attendance  = require('../models/attendance.model');
const { LeaveRequest, LeaveType } = require('../models/leave.model');
const {
  SalaryComponent,
  EmployeeSalaryComponent,
  PayrollRun,
  PayrollItem,
  PayrollItemComponent,
} = require('../models/payroll.model');

// ── Pure calendar helpers ─────────────────────────────────────────────────────

/**
 * Pad a number to 2 digits.
 * @param {number} n
 * @returns {string}
 */
function pad(n) { return String(n).padStart(2, '0'); }

/**
 * Returns the YYYY-MM-DD first and last day of the given month.
 */
function monthRange(year, month) {
  const from    = `${year}-${pad(month)}-01`;
  const lastDay = new Date(year, month, 0).getDate();   // day 0 of next month
  const to      = `${year}-${pad(month)}-${pad(lastDay)}`;
  return { from, to, lastDay };
}

/**
 * Count Mon–Fri days in [startStr, endStr] (inclusive, YYYY-MM-DD).
 * Pure — no Date timezone issues because we parse with UTC noon.
 *
 * @param {string} startStr  "YYYY-MM-DD"
 * @param {string} endStr    "YYYY-MM-DD"
 * @returns {number}
 */
function countWeekdays(startStr, endStr) {
  let count = 0;
  // Use T12:00Z to avoid any daylight-saving midnight edge cases
  const cur  = new Date(startStr + 'T12:00:00Z');
  const stop = new Date(endStr   + 'T12:00:00Z');
  while (cur <= stop) {
    const dow = cur.getUTCDay(); // 0=Sun, 6=Sat
    if (dow !== 0 && dow !== 6) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

/**
 * Count working (Mon–Fri) days in the given month.
 *
 * @param {number} year
 * @param {number} month  1-based
 * @returns {number}
 */
function computeWorkingDays(year, month) {
  const { from, to } = monthRange(year, month);
  return countWeekdays(from, to);
}

// ── Pure payslip calculator ───────────────────────────────────────────────────

/**
 * Attendance + leave statistics for one employee for one month.
 *
 * @typedef {object} MonthStats
 * @property {number} working_days         Mon–Fri days in the month
 * @property {number} actual_days          Worked days (PRESENT=1, LATE=1, HALF_DAY=0.5)
 * @property {number} absent_days          Unexcused absence days
 * @property {number} paid_leave_days      Approved paid-leave working days
 * @property {number} unpaid_leave_days    Approved unpaid-leave working days
 * @property {number} overtime_minutes     Sum of overtime_minutes in attendance
 * @property {number} late_minutes         Sum of late_minutes in attendance
 */

/**
 * One resolved salary component (with override applied).
 *
 * @typedef {object} ResolvedComponent
 * @property {number}  comp_id
 * @property {string}  name
 * @property {'ADDITION'|'DEDUCTION'} type
 * @property {number}  value          effective numeric value (rate or amount)
 * @property {boolean} is_percentage  true → value is a % of base_salary
 * @property {boolean} is_taxable
 */

/**
 * Engine configuration (all optional).
 *
 * @typedef {object} EngineConfig
 * @property {number} overtime_multiplier      default 1.5
 * @property {number} standard_hours_per_day   default 8
 */

/**
 * Core pure calculation — no DB access.
 * Takes a snapshot of all inputs and returns the full payslip breakdown.
 *
 * @param {object}             employee   Must have `.base_salary`
 * @param {MonthStats}         stats
 * @param {ResolvedComponent[]} components
 * @param {EngineConfig}       config
 * @returns {object}  Payslip fields + line_items array
 */
function calculatePayslip(employee, stats, components, config = {}) {
  const {
    working_days,
    actual_days,
    absent_days,
    paid_leave_days,
    unpaid_leave_days,
    overtime_minutes,
    late_minutes,
  } = stats;

  const {
    overtime_multiplier    = 1.5,
    standard_hours_per_day = 8,
  } = config;

  // ── Base rates ────────────────────────────────────────────────────────────
  const base       = +parseFloat(employee.base_salary || 0).toFixed(2);
  const daily_rate = working_days > 0 ? base / working_days : 0;
  const hourly_rate = working_days > 0
    ? base / (working_days * standard_hours_per_day)
    : 0;

  const line_items = [];

  // ── AUTO: Absence deduction ───────────────────────────────────────────────
  const absence_amount = +(absent_days * daily_rate).toFixed(2);
  if (absence_amount > 0) {
    line_items.push({
      component_id  : null,
      component_name: 'Absence Deduction',
      type          : 'DEDUCTION',
      amount        : absence_amount,
      source        : 'AUTO',
    });
  }

  // ── AUTO: Unpaid-leave deduction ──────────────────────────────────────────
  const unpaid_leave_amount = +(unpaid_leave_days * daily_rate).toFixed(2);
  if (unpaid_leave_amount > 0) {
    line_items.push({
      component_id  : null,
      component_name: 'Unpaid Leave Deduction',
      type          : 'DEDUCTION',
      amount        : unpaid_leave_amount,
      source        : 'AUTO',
    });
  }

  // ── AUTO: Overtime pay ────────────────────────────────────────────────────
  const overtime_hours  = overtime_minutes / 60;
  const overtime_amount = +(overtime_hours * hourly_rate * overtime_multiplier).toFixed(2);
  if (overtime_amount > 0) {
    line_items.push({
      component_id  : null,
      component_name: 'Overtime Pay',
      type          : 'ADDITION',
      amount        : overtime_amount,
      source        : 'AUTO',
    });
  }

  // ── COMPONENT: salary component line items ────────────────────────────────
  for (const comp of components) {
    const raw    = +parseFloat(comp.value).toFixed(4);
    const amount = comp.is_percentage
      ? +(base * raw / 100).toFixed(2)
      : +raw.toFixed(2);
    if (amount === 0) continue;   // skip zero-valued components
    line_items.push({
      component_id  : comp.comp_id,
      component_name: comp.name,
      type          : comp.type,
      amount,
      source        : 'COMPONENT',
    });
  }

  // ── Totals ────────────────────────────────────────────────────────────────
  const total_additions  = +line_items
    .filter(l => l.type === 'ADDITION')
    .reduce((s, l) => s + l.amount, 0)
    .toFixed(2);

  const total_deductions = +line_items
    .filter(l => l.type === 'DEDUCTION')
    .reduce((s, l) => s + l.amount, 0)
    .toFixed(2);

  const gross_salary = +(base + total_additions).toFixed(2);
  const tax_amount   = 0;   // Tax engine reserved for future module
  const net_salary   = +(gross_salary - total_deductions - tax_amount).toFixed(2);

  return {
    // Snapshot header
    base_salary      : base,
    working_days,
    actual_days,
    absent_days,
    paid_leave_days,
    unpaid_leave_days,
    leave_days       : +(paid_leave_days + unpaid_leave_days).toFixed(1),
    overtime_minutes,
    late_minutes,
    // Money
    daily_rate       : +daily_rate.toFixed(4),
    hourly_rate      : +hourly_rate.toFixed(4),
    total_additions,
    total_deductions,
    gross_salary,
    tax_amount,
    net_salary,
    line_items,       // PayrollItemComponent rows to insert
  };
}

// Public export for unit tests
module.exports.calculatePayslip = calculatePayslip;
module.exports.computeWorkingDays = computeWorkingDays;
module.exports.countWeekdays = countWeekdays;

// ── DB data gatherers ─────────────────────────────────────────────────────────

/**
 * Fetch and aggregate attendance + leave data for one employee in one month.
 *
 * @param {number} company_id
 * @param {number} employee_id
 * @param {number} year
 * @param {number} month   1-based
 * @returns {Promise<MonthStats>}
 */
async function gatherEmployeeMonthData(company_id, employee_id, year, month) {
  const { from, to } = monthRange(year, month);
  const working_days  = computeWorkingDays(year, month);

  // ── Attendance records for the month ─────────────────────────────────────
  const attRows = await Attendance.findAll({
    where: {
      company_id,
      employee_id,
      work_date: { [Op.between]: [from, to] },
    },
    attributes: ['status', 'overtime_minutes', 'late_minutes'],
    raw: true,
  });

  let present_count  = 0;
  let half_count     = 0;
  let total_overtime = 0;
  let total_late     = 0;

  for (const r of attRows) {
    if (r.status === 'PRESENT' || r.status === 'LATE') present_count++;
    if (r.status === 'HALF_DAY')                        half_count++;
    total_overtime += Number(r.overtime_minutes) || 0;
    total_late     += Number(r.late_minutes)     || 0;
  }

  const actual_days = +(present_count + half_count * 0.5).toFixed(1);

  // ── Approved leave requests overlapping the month ─────────────────────────
  const leaves = await LeaveRequest.findAll({
    where: {
      company_id,
      employee_id,
      status    : 'APPROVED',
      start_date: { [Op.lte]: to },
      end_date  : { [Op.gte]: from },
    },
    include: [{
      model     : LeaveType,
      as        : 'leaveType',
      attributes: ['is_paid'],
    }],
    raw  : true,
    nest : true,
  });

  let paid_leave_days   = 0;
  let unpaid_leave_days = 0;

  for (const lr of leaves) {
    // Clip leave range to the current month
    const leaveStart = lr.start_date < from ? from : lr.start_date;
    const leaveEnd   = lr.end_date   > to   ? to   : lr.end_date;
    const days       = countWeekdays(leaveStart, leaveEnd);
    if (lr.leaveType.is_paid) paid_leave_days   += days;
    else                       unpaid_leave_days += days;
  }

  // absent_days = working days not accounted for by attendance or approved leave
  const absent_days = Math.max(
    0,
    +(working_days - actual_days - paid_leave_days - unpaid_leave_days).toFixed(1)
  );

  return {
    working_days,
    actual_days,
    absent_days,
    paid_leave_days,
    unpaid_leave_days,
    overtime_minutes: total_overtime,
    late_minutes    : total_late,
  };
}

/**
 * Resolve the effective salary components for one employee.
 * Priority: per-employee override value (if set) over the component default.
 * Global components + specifically-assigned components are both included.
 *
 * @param {number} company_id
 * @param {number} employee_id
 * @param {string} runDate   "YYYY-MM-DD" — used to check effective_from/to windows
 * @returns {Promise<ResolvedComponent[]>}
 */
async function resolveComponents(company_id, employee_id, runDate) {
  // Global components (applies_to_all = 1)
  const global = await SalaryComponent.findAll({
    where: { company_id, is_active: 1, applies_to_all: 1 },
    raw  : true,
  });

  // Per-employee overrides / specific components
  const empAssignments = await EmployeeSalaryComponent.findAll({
    where: {
      company_id,
      employee_id,
      effective_from: { [Op.lte]: runDate },
      [Op.or]: [
        { effective_to: null },
        { effective_to: { [Op.gte]: runDate } },
      ],
    },
    include: [{
      model     : SalaryComponent,
      as        : 'component',
      attributes: ['id','name','type','value','is_percentage','is_taxable','applies_to_all','is_active'],
    }],
    raw : true,
    nest: true,
  });

  // Build override map: component_id → effective value
  const overrideMap = {};
  const specificIds = new Set();
  for (const ea of empAssignments) {
    if (!ea.component || !ea.component.is_active) continue;
    overrideMap[ea.component_id] =
      ea.override_value !== null ? Number(ea.override_value) : Number(ea.component.value);
    if (!ea.component.applies_to_all) specificIds.add(ea.component_id);
  }

  // Merge: global comps + any specific non-global comps
  const specificComps = await SalaryComponent.findAll({
    where: { company_id, is_active: 1, applies_to_all: 0, id: { [Op.in]: [...specificIds] } },
    raw  : true,
  });

  const allComps   = [...global];
  const globalIds  = new Set(global.map(c => c.id));
  for (const sc of specificComps) {
    if (!globalIds.has(sc.id)) allComps.push(sc);
  }

  return allComps.map(comp => ({
    comp_id      : comp.id,
    name         : comp.name,
    type         : comp.type,
    value        : overrideMap[comp.id] !== undefined ? overrideMap[comp.id] : Number(comp.value),
    is_percentage: !!comp.is_percentage,
    is_taxable   : !!comp.is_taxable,
  }));
}

// ── Main engine orchestrator ──────────────────────────────────────────────────

/**
 * Run the payroll engine for a PayrollRun.
 * Called by `payroll.service.js → processRun`.
 *
 * - DRAFT and PROCESSING runs can be (re-)calculated.
 * - For each active employee: gather data → calculate → snapshot to DB.
 * - Wraps everything in a single transaction; rolls back on any error.
 *
 * @param {number} run_id
 * @param {number} company_id
 * @param {number} processed_by   user.id of the triggering user
 * @param {EngineConfig} config   optional overrides
 * @returns {Promise<PayrollRun>} reloaded run
 */
async function runPayrollEngine(run_id, company_id, processed_by, config = {}) {
  const badReq = (msg) => Object.assign(new Error(msg), { statusCode: 400, code: 'VALIDATION_ERROR' });
  const notFound = (id) => Object.assign(new Error(`PayrollRun ${id} not found`), { statusCode: 404, code: 'NOT_FOUND' });

  const run = await PayrollRun.findOne({ where: { id: run_id, company_id } });
  if (!run) throw notFound(run_id);
  if (!['DRAFT', 'PROCESSING'].includes(run.status)) {
    throw badReq(`Cannot process a run with status "${run.status}"`);
  }

  const { run_month, run_year } = run;

  // The reference date for component effective_from/to checks
  const runDate = `${run_year}-${pad(run_month)}-01`;

  // Mark as PROCESSING so concurrent requests are rejected
  await run.update({ status: 'PROCESSING', processed_by, processed_at: new Date() });

  // Active employees for this company
  const employees = await Employee.findAll({
    where: { company_id, status: 'ACTIVE' },
    raw  : true,
  });

  const t = await sequelize.transaction();
  try {
    // Delete any prior payslips for this run (idempotent re-run)
    const priorItems = await PayrollItem.findAll({
      where     : { company_id, payroll_run_id: run.id },
      attributes: ['id'],
      raw       : true,
      transaction: t,
    });
    if (priorItems.length > 0) {
      const priorIds = priorItems.map(p => p.id);
      await PayrollItemComponent.destroy({ where: { payroll_item_id: { [Op.in]: priorIds } }, transaction: t });
      await PayrollItem.destroy({ where: { id: { [Op.in]: priorIds } }, transaction: t });
    }

    let totalGross = 0, totalDeductions = 0, totalNet = 0;

    for (const emp of employees) {
      // ── Gather data (outside transaction — read-only) ──────────────────
      const stats      = await gatherEmployeeMonthData(company_id, emp.id, run_year, run_month);
      const components = await resolveComponents(company_id, emp.id, runDate);

      // ── Pure calculation — no DB ────────────────────────────────────────
      const payslip = calculatePayslip(emp, stats, components, config);

      // ── Snapshot → PayrollItem ──────────────────────────────────────────
      const item = await PayrollItem.create({
        company_id,
        payroll_run_id  : run.id,
        employee_id     : emp.id,
        working_days    : payslip.working_days,
        actual_days     : payslip.actual_days,
        absent_days     : payslip.absent_days,
        paid_leave_days : payslip.paid_leave_days,
        unpaid_leave_days: payslip.unpaid_leave_days,
        leave_days      : payslip.leave_days,
        overtime_minutes: payslip.overtime_minutes,
        late_minutes    : payslip.late_minutes,
        base_salary     : payslip.base_salary,
        total_additions : payslip.total_additions,
        total_deductions: payslip.total_deductions,
        gross_salary    : payslip.gross_salary,
        tax_amount      : payslip.tax_amount,
        net_salary      : payslip.net_salary,
      }, { transaction: t });

      // ── Snapshot → PayrollItemComponent (line items) ───────────────────
      for (const li of payslip.line_items) {
        await PayrollItemComponent.create({
          company_id,
          payroll_item_id: item.id,
          component_id   : li.component_id,
          component_name : li.component_name,
          type           : li.type,
          amount         : li.amount,
          source         : li.source,
        }, { transaction: t });
      }

      totalGross       += payslip.gross_salary;
      totalDeductions  += payslip.total_deductions;
      totalNet         += payslip.net_salary;
    }

    // ── Update run header totals ───────────────────────────────────────────
    await run.update({
      status          : 'PROCESSING',   // stays PROCESSING until HR approves
      total_employees : employees.length,
      total_gross     : +totalGross.toFixed(2),
      total_deductions: +totalDeductions.toFixed(2),
      total_net       : +totalNet.toFixed(2),
      processed_by,
      processed_at    : new Date(),
    }, { transaction: t });

    await t.commit();
    return run.reload();
  } catch (e) {
    await t.rollback();
    // Reset run to DRAFT so it can be retried
    await run.update({ status: 'DRAFT' }).catch(() => {});
    throw e;
  }
}

module.exports = {
  // Pure helpers — exported for unit tests
  calculatePayslip,
  computeWorkingDays,
  countWeekdays,
  // DB-dependent
  gatherEmployeeMonthData,
  resolveComponents,
  runPayrollEngine,
};
