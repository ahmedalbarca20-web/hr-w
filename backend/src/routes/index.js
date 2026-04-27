const { Router }    = require('express');
const authRoutes         = require('./auth.routes');
const companyRoutes      = require('./company.routes');
const employeeRoutes     = require('./employee.routes');
const departmentRoutes   = require('./department.routes');
const attendanceRoutes   = require('./attendance.routes');
const attendanceRequestRoutes = require('./attendance_request.routes');
const leaveRoutes        = require('./leave.routes');
const payrollRoutes      = require('./payroll.routes');
const userRoutes         = require('./user.routes');
const announcementRoutes = require('./announcement.routes');
const deviceRoutes        = require('./device.routes');
const shiftsRoutes        = require('./shifts.routes');
const processRoutes       = require('./process.routes');
const reportRoutes        = require('./report.routes');

const { authenticate }  = require('../middleware/auth.middleware');
const { sendSuccess }   = require('../utils/response');
const { QueryTypes }    = require('sequelize');
const { sequelize }     = require('../config/db');
const { sumIf, daysAgo } = require('../utils/sqlDialect');
const Company           = require('../models/company.model');
const { ymdInTimeZone, DEFAULT_IANA } = require('../utils/timezone');

const router = Router();

// Health check (no auth required)
router.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date() }));

// Dashboard summary
router.get('/dashboard/summary', authenticate, async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const coTz = await Company.findByPk(companyId, { attributes: ['timezone'] });
    const tz = (coTz?.timezone && String(coTz.timezone).trim()) || DEFAULT_IANA;
    const today = ymdInTimeZone(tz);
    const month = Number(today.slice(5, 7));
    const year  = Number(today.slice(0, 4));

    const [totals] = await sequelize.query(`
      SELECT
        (SELECT COUNT(*) FROM employees WHERE company_id=:cid AND status='ACTIVE' AND deleted_at IS NULL)   AS total_employees,
        (SELECT COUNT(*) FROM attendance  WHERE company_id=:cid AND work_date=:today AND status='PRESENT')  AS present_today,
        (SELECT COUNT(*) FROM employees  WHERE company_id=:cid AND status='ON_LEAVE' AND deleted_at IS NULL) AS on_leave,
        (SELECT COALESCE(SUM(pi.net_salary),0)
           FROM payroll_items pi
           JOIN payroll_runs pr ON pr.id=pi.payroll_run_id
          WHERE pr.company_id=:cid AND pr.run_month=:month AND pr.run_year=:year
            AND pr.status IN ('PROCESSED','APPROVED','PAID'))  AS month_payroll
    `, { replacements: { cid: companyId, today, month, year }, type: QueryTypes.SELECT });

    const dept = await sequelize.query(`
      SELECT d.name, COUNT(e.id) AS value
      FROM employees e
      JOIN departments d ON d.id=e.department_id
      WHERE e.company_id=:cid AND e.deleted_at IS NULL AND e.status='ACTIVE'
      GROUP BY d.id, d.name
      ORDER BY value DESC LIMIT 8
    `, { replacements: { cid: companyId }, type: QueryTypes.SELECT });

    const sevenDaysAgo = daysAgo(7);
    const attend7 = await sequelize.query(`
      SELECT work_date AS day,
        ${sumIf('status', 'PRESENT')} AS present,
        ${sumIf('status', 'ABSENT')}  AS absent
      FROM attendance
      WHERE company_id=:cid AND work_date >= :sevenDaysAgo
      GROUP BY work_date ORDER BY work_date
    `, { replacements: { cid: companyId, sevenDaysAgo }, type: QueryTypes.SELECT });

    sendSuccess(res, {
      total_employees : totals.total_employees,
      present_today   : totals.present_today,
      on_leave        : totals.on_leave,
      month_payroll   : Number(totals.month_payroll).toLocaleString(),
      dept_distribution : dept,
      attendance_week   : attend7,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Company Settings ──────────────────────────────────────────────────────────

router.get('/settings/company', authenticate, async (req, res) => {
  try {
    const id = req.user.company_id;
    if (!id) return res.json({ success: true, data: { currency: 'IQD', timezone: 'Asia/Baghdad' } });
    const co = await Company.findByPk(id, { attributes: ['id', 'name', 'currency', 'timezone', 'tax_id'] });
    if (!co) return res.json({ success: true, data: { currency: 'IQD', timezone: 'Asia/Baghdad' } });
    return res.json({
      success: true,
      data: {
        id: co.id,
        name: co.name,
        currency: co.currency,
        timezone: co.timezone,
        company_code: co.tax_id || '',
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/settings/company', authenticate, async (req, res) => {
  try {
    const id = req.user.company_id;
    if (!id) return res.status(400).json({ success: false, error: 'No company context' });
    const allowed = ['currency', 'timezone', 'name', 'name_ar', 'phone', 'email', 'address'];
    const updates = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => allowed.includes(k))
    );
    await Company.update(updates, { where: { id } });
    const co = await Company.findByPk(id, { attributes: ['id', 'name', 'currency', 'timezone'] });
    return res.json({ success: true, data: co });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Auth module
router.use('/auth', authRoutes);

// Super-Admin: company management
router.use('/companies', companyRoutes);

// Core HR modules
router.use('/employees',      employeeRoutes);
router.use('/departments',    departmentRoutes);
router.use('/attendance',     attendanceRoutes);
router.use('/attendance-requests', attendanceRequestRoutes);
router.use('/leaves',         leaveRoutes);
router.use('/payroll',        payrollRoutes);

// Settings / admin
router.use('/users',          userRoutes);
router.use('/announcements',  announcementRoutes);

// Device management
router.use('/devices', deviceRoutes);

// Attendance Processing Engine
router.use('/shifts',  shiftsRoutes);
router.use('/process', processRoutes);

// Reports
router.use('/reports', reportRoutes);

module.exports = router;

