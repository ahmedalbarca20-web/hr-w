'use strict';

const { Op, fn, col, literal } = require('sequelize');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const Attendance  = require('../models/attendance.model');
const Employee    = require('../models/employee.model');
const Leave       = require('../models/leave.model');
const Payroll     = require('../models/payroll.model');
const Department  = require('../models/department.model');
const { sequelize } = require('../config/db');
const { QueryTypes } = require('sequelize');
const { concat, sumIf, yearOf } = require('../utils/sqlDialect');

const { sendError } = require('../utils/response');

const resolveCompanyId = (req, res) => {
  if (req.user.company_id !== null && req.user.company_id !== undefined) return req.user.company_id;

  const raw = req.query.company_id ?? req.body?.company_id ?? null;
  const id = Number(raw);

  if (!Number.isInteger(id) || id < 1) {
    sendError(res, 'company_id is required for super admin', 422, 'VALIDATION_ERROR');
    return null;
  }

  return id;
};

// ── GET /api/reports/attendance ──────────────────────────────────────────────
exports.attendanceReport = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  const year  = Number(req.query.year)  || new Date().getFullYear();
  const month = Number(req.query.month) || new Date().getMonth() + 1;

  const pad   = (n) => String(n).padStart(2, '0');
  const from  = `${year}-${pad(month)}-01`;
  const to    = `${year}-${pad(month)}-${new Date(year, month, 0).getDate()}`;

  const rows = await sequelize.query(`
    SELECT
      e.id            AS employee_id,
      ${concat('e.first_name', 'e.last_name')} AS employee_name,
      e.employee_number,
      d.name          AS department,
      ${sumIf('a.status', 'PRESENT')}  AS present_days,
      ${sumIf('a.status', 'ABSENT')}   AS absent_days,
      ${sumIf('a.status', 'LATE')}     AS late_days,
      ${sumIf('a.status', 'HALF_DAY')} AS half_days,
      ${sumIf('a.status', 'ON_LEAVE')} AS leave_days,
      SUM(COALESCE(a.total_minutes,0))    AS total_minutes,
      SUM(COALESCE(a.overtime_minutes,0)) AS overtime_minutes
    FROM employees e
    LEFT JOIN departments d ON d.id = e.department_id
    LEFT JOIN attendance a
      ON a.employee_id = e.id
      AND a.work_date BETWEEN :from AND :to
    WHERE e.company_id = :companyId
      AND e.deleted_at IS NULL
      AND e.status = 'ACTIVE'
    GROUP BY e.id, e.first_name, e.last_name, e.employee_number, d.name
    ORDER BY e.employee_number
  `, { replacements: { companyId, from, to }, type: QueryTypes.SELECT });

  sendSuccess(res, { year, month, from, to, rows });
});

// ── GET /api/reports/leaves ──────────────────────────────────────────────────
exports.leaveReport = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  const year = Number(req.query.year) || new Date().getFullYear();

  const rows = await sequelize.query(`
    SELECT
      e.id            AS employee_id,
      ${concat('e.first_name', 'e.last_name')} AS employee_name,
      e.employee_number,
      d.name          AS department,
      lt.name         AS leave_type,
      COUNT(lr.id)    AS total_requests,
      SUM(CASE WHEN lr.status='APPROVED' THEN lr.total_days ELSE 0 END) AS approved_days,
      SUM(CASE WHEN lr.status='REJECTED' THEN 1 ELSE 0 END) AS rejected_count,
      SUM(CASE WHEN lr.status='PENDING' THEN 1 ELSE 0 END)  AS pending_count
    FROM employees e
    LEFT JOIN departments d ON d.id = e.department_id
    LEFT JOIN leave_requests lr
      ON lr.employee_id = e.id
      AND ${yearOf('lr.start_date')} = :year
    LEFT JOIN leave_types lt ON lt.id = lr.leave_type_id
    WHERE e.company_id = :companyId
      AND e.deleted_at IS NULL
    GROUP BY e.id, e.first_name, e.last_name, e.employee_number, d.name, lt.name
    ORDER BY e.employee_number
  `, { replacements: { companyId, year }, type: QueryTypes.SELECT });

  sendSuccess(res, { year, rows });
});

// ── GET /api/reports/payroll ─────────────────────────────────────────────────
exports.payrollReport = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req, res); if (!companyId) return;
  const year = Number(req.query.year) || new Date().getFullYear();

  const rows = await sequelize.query(`
    SELECT
      pr.run_month  AS month,
      pr.run_year   AS year,
      pr.status,
      COUNT(pi.id)             AS employee_count,
      SUM(pi.base_salary)      AS total_base,
      SUM(pi.total_additions)  AS total_additions,
      SUM(pi.total_deductions) AS total_deductions,
      SUM(pi.net_salary)       AS total_net
    FROM payroll_runs pr
    LEFT JOIN payroll_items pi ON pi.payroll_run_id = pr.id
    WHERE pr.company_id = :companyId
      AND pr.run_year = :year
    GROUP BY pr.id, pr.run_month, pr.run_year, pr.status
    ORDER BY pr.run_month
  `, { replacements: { companyId, year }, type: QueryTypes.SELECT });

  sendSuccess(res, { year, rows });
});

// ── GET /api/reports/headcount ───────────────────────────────────────────────
exports.headcountReport = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req, res); if (!companyId) return;

  const rows = await sequelize.query(`
    SELECT
      d.name          AS department,
      e.contract_type,
      e.status        AS emp_status,
      COUNT(e.id)     AS count
    FROM employees e
    LEFT JOIN departments d ON d.id = e.department_id
    WHERE e.company_id = :companyId
      AND e.deleted_at IS NULL
    GROUP BY d.name, e.contract_type, e.status
    ORDER BY d.name
  `, { replacements: { companyId }, type: QueryTypes.SELECT });

  sendSuccess(res, { rows });
});

