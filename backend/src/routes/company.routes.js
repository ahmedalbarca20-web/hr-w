'use strict';

/**
 * Company routes — Super-Admin only
 *
 * GET    /api/companies                  – list all companies
 * POST   /api/companies                  – create company
 * GET    /api/companies/:id              – get one company
 * PUT    /api/companies/:id              – update company
 * PATCH  /api/companies/:id/status       – activate / deactivate
 * POST   /api/companies/:id/contract-doc – upload contract document
 * DELETE /api/companies/:id              – delete company
 */

const path             = require('path');
const fs               = require('fs');
const { Router }       = require('express');
const multer           = require('multer');
const { authenticate } = require('../middleware/auth.middleware');
const { requireSuperAdmin } = require('../middleware/role.middleware');
const {
  Company, CompanyFeature, Role, User, Department, Employee, Attendance,
  LeaveType, LeaveBalance, LeaveRequest,
  SalaryComponent, EmployeeSalaryComponent, PayrollRun, PayrollItem, PayrollItemComponent,
  Announcement, Device, DeviceLog, WorkShift,
} = require('../models/index');
const { Op }           = require('sequelize');
const { COMPANY_FEATURES } = require('../constants/company-features');
const { hashPassword } = require('../utils/hash');
const { sequelize } = require('../config/db');
const {
  normalizeFeatureList,
  getCompanyEnabledFeatures,
  setCompanyFeatures,
} = require('../services/company-feature.service');
const { ymdInTimeZone, DEFAULT_IANA, addCalendarMonthsYmd } = require('../utils/timezone');

const r = Router();
const isVercelRuntime = Boolean(process.env.VERCEL);
const uploadBaseDir = isVercelRuntime
  ? path.join('/tmp', 'uploads')
  : path.join(__dirname, '..', '..', 'uploads');
const resolveStoredUploadPath = (relativePath) =>
  path.join(uploadBaseDir, String(relativePath || '').replace(/^uploads[\\/]/, ''));
const DEFAULT_LEAVE_TYPES = [
  {
    name: 'Annual Leave',
    name_ar: 'إجازة سنوية',
    max_days_per_year: 30,
    is_paid: 1,
    carry_forward: 1,
    max_carry_days: 10,
    requires_approval: 1,
    gender_specific: 'ALL',
  },
  {
    name: 'Sick Leave',
    name_ar: 'إجازة مرضية',
    max_days_per_year: 10,
    is_paid: 1,
    carry_forward: 0,
    max_carry_days: 0,
    requires_approval: 1,
    gender_specific: 'ALL',
  },
  {
    name: 'Unpaid Leave',
    name_ar: 'إجازة بدون راتب',
    max_days_per_year: 0,
    is_paid: 0,
    carry_forward: 0,
    max_carry_days: 0,
    requires_approval: 1,
    gender_specific: 'ALL',
  },
  {
    name: 'Maternity Leave',
    name_ar: 'إجازة أمومة',
    max_days_per_year: 90,
    is_paid: 1,
    carry_forward: 0,
    max_carry_days: 0,
    requires_approval: 1,
    gender_specific: 'FEMALE',
  },
  {
    name: 'Paternity Leave',
    name_ar: 'إجازة أبوة',
    max_days_per_year: 5,
    is_paid: 1,
    carry_forward: 0,
    max_carry_days: 0,
    requires_approval: 1,
    gender_specific: 'MALE',
  },
];

const addMonths = (dateString, months) => addCalendarMonthsYmd(dateString, months);

const normalizeCompanyCode = (code) =>
  String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '');

const buildCompanyCode = (name) => {
  const base = normalizeCompanyCode(name).replace(/_/g, '').slice(0, 8) || 'COMP';
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${base}-${suffix}`;
};

const normalizeOptionalDate = (v) => {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim();
  return s ? s : null;
};

const ensureDefaultLeaveTypes = async (companyId) => {
  const count = await LeaveType.count({ where: { company_id: companyId } });
  if (count > 0) return 0;

  await LeaveType.bulkCreate(
    DEFAULT_LEAVE_TYPES.map((lt) => ({ ...lt, company_id: companyId, is_active: 1 })),
  );
  return DEFAULT_LEAVE_TYPES.length;
};

const DEFAULT_ROLE_TEMPLATES = [
  { name: 'ADMIN', name_ar: 'مدير النظام', permissions: ['*'] },
  { name: 'HR', name_ar: 'الموارد البشرية', permissions: ['employees:*', 'attendance:*', 'leaves:*', 'payroll:read'] },
  { name: 'EMPLOYEE', name_ar: 'موظف', permissions: ['profile:read', 'leaves:request', 'attendance:self'] },
];

const ensureDefaultRoles = async (companyId) => {
  const roleMap = {};
  for (const r of DEFAULT_ROLE_TEMPLATES) {
    const [role] = await Role.findOrCreate({
      where: { company_id: companyId, name: r.name },
      defaults: {
        company_id: companyId,
        name: r.name,
        name_ar: r.name_ar,
        permissions: r.permissions,
        is_system: 1,
      },
    });
    roleMap[r.name] = role;
  }
  return roleMap;
};

const createCompanyAdminUser = async ({ companyId, email, password, adminRoleId }) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || !password) return null;

  const existing = await User.findOne({ where: { email: normalizedEmail } });
  if (existing) {
    const err = new Error(`Email ${normalizedEmail} is already registered`);
    err.statusCode = 409;
    throw err;
  }

  const password_hash = await hashPassword(password);
  return User.create({
    company_id: companyId,
    role_id: adminRoleId,
    email: normalizedEmail,
    password_hash,
    is_active: 1,
  });
};

// ── Multer — contract documents ───────────────────────────────────────────────
const contractDir = path.join(uploadBaseDir, 'contracts');
if (!fs.existsSync(contractDir)) fs.mkdirSync(contractDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, contractDir),
  filename   : (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});
const upload = multer({
  storage,
  limits     : { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter : (_req, file, cb) => {
    const allowed = /pdf|jpeg|jpg|png|webp/i;
    if (!allowed.test(path.extname(file.originalname))) {
      return cb(new Error('Only PDF, JPG, PNG files allowed'));
    }
    cb(null, true);
  },
});

// All company-management routes require super-admin
r.use(authenticate);
r.use(requireSuperAdmin);

// ── Backfill default leave types for existing companies ───────────────────────
r.post('/backfill-leave-types', async (_req, res) => {
  try {
    const companies = await Company.findAll({ attributes: ['id'] });
    let affectedCompanies = 0;
    let totalCreated = 0;

    for (const c of companies) {
      const created = await ensureDefaultLeaveTypes(c.id);
      if (created > 0) {
        affectedCompanies += 1;
        totalCreated += created;
      }
    }

    return res.json({
      success: true,
      data: {
        companies_scanned: companies.length,
        companies_seeded: affectedCompanies,
        leave_types_created: totalCreated,
      },
      message: 'Backfill completed',
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── List ──────────────────────────────────────────────────────────────────────
r.get('/', async (req, res) => {
  try {
    const { search = '', page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const where = search
      ? { [Op.or]: [
          { name:    { [Op.like]: `%${search}%` } },
          { name_ar: { [Op.like]: `%${search}%` } },
        ] }
      : {};

    const { count, rows } = await Company.findAndCountAll({
      where,
      order      : [['id', 'ASC']],
      limit      : Number(limit),
      offset,
    });

    return res.json({
      success : true,
      data    : rows,
      meta    : { total: count, page: Number(page), limit: Number(limit) },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── Get one ───────────────────────────────────────────────────────────────────
r.get('/:id', async (req, res) => {
  try {
    const co = await Company.findByPk(req.params.id);
    if (!co) return res.status(404).json({ success: false, error: 'Company not found' });
    return res.json({ success: true, data: co });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── Create ────────────────────────────────────────────────────────────────────
r.post('/', async (req, res) => {
  try {
    const allowed = ['name', 'name_ar', 'currency', 'timezone', 'phone', 'email', 'address', 'tax_id', 'contract_start', 'contract_end', 'contract_months', 'company_code', 'enabled_features', 'password'];
    const data    = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => allowed.includes(k))
    );
    const enabledFeatures = normalizeFeatureList(data.enabled_features);
    const adminPassword = String(data.password || '').trim();
    data.contract_start = normalizeOptionalDate(data.contract_start);
    data.contract_end = normalizeOptionalDate(data.contract_end);

    if (data.contract_months && !data.contract_end) {
      const start = data.contract_start || ymdInTimeZone(data.timezone || DEFAULT_IANA);
      data.contract_start = start;
      data.contract_end   = addMonths(start, Number(data.contract_months));
    }

    delete data.contract_months;

    if (data.contract_start && data.contract_end && data.contract_end < data.contract_start) {
      return res.status(422).json({ success: false, error: 'contract_end must be after contract_start' });
    }

    if (!data.name) return res.status(422).json({ success: false, error: 'name is required' });
    if (!data.email || !adminPassword) {
      return res.status(422).json({
        success: false,
        error: 'Admin login email and password are required when creating a company',
      });
    }
    if (adminPassword.length < 8) {
      return res.status(422).json({ success: false, error: 'Admin password must be at least 8 characters' });
    }
    const adminEmail = String(data.email || '').trim().toLowerCase();
    const emailDup = await User.findOne({ where: { email: adminEmail } });
    if (emailDup) {
      return res.status(409).json({ success: false, error: `Email ${adminEmail} is already registered` });
    }
    // We store the company login code in `tax_id` to avoid schema migration.
    data.tax_id = normalizeCompanyCode(data.company_code || data.tax_id) || buildCompanyCode(data.name);
    delete data.company_code;
    delete data.enabled_features;
    delete data.password;

    const dup = await Company.findOne({ where: { tax_id: data.tax_id } });
    if (dup) {
      return res.status(409).json({ success: false, error: 'company_code already exists' });
    }

    const co = await Company.create(data);
    await ensureDefaultLeaveTypes(co.id);
    const roles = await ensureDefaultRoles(co.id);
    await createCompanyAdminUser({
      companyId: co.id,
      email: adminEmail,
      password: adminPassword,
      adminRoleId: roles.ADMIN.id,
    });
    if (enabledFeatures.length > 0) {
      await setCompanyFeatures(co.id, enabledFeatures);
    }
    return res.status(201).json({
      success: true,
      data: {
        ...co.toJSON(),
        company_code: co.tax_id,
        admin_login_email: adminEmail,
      },
    });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ success: false, error: err.message });
  }
});

// ── Update ────────────────────────────────────────────────────────────────────
r.put('/:id', async (req, res) => {
  try {
    const co = await Company.findByPk(req.params.id);
    if (!co) return res.status(404).json({ success: false, error: 'Company not found' });

    const allowed = ['name', 'name_ar', 'currency', 'timezone', 'phone', 'email', 'address', 'tax_id', 'logo', 'contract_start', 'contract_end', 'contract_months', 'company_code', 'enabled_features', 'password'];
    const updates = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => allowed.includes(k))
    );
    const adminPassword = String(updates.password || '').trim();
    updates.contract_start = normalizeOptionalDate(updates.contract_start);
    updates.contract_end = normalizeOptionalDate(updates.contract_end);
    const hasFeaturePayload = Object.prototype.hasOwnProperty.call(updates, 'enabled_features');
    const enabledFeatures = hasFeaturePayload ? normalizeFeatureList(updates.enabled_features) : null;

    if (updates.contract_months && !updates.contract_end) {
      const start = updates.contract_start || co.contract_start || ymdInTimeZone(co.timezone || DEFAULT_IANA);
      updates.contract_start = start;
      updates.contract_end   = addMonths(start, Number(updates.contract_months));
    }

    delete updates.contract_months;

    if (updates.contract_start && updates.contract_end && updates.contract_end < updates.contract_start) {
      return res.status(422).json({ success: false, error: 'contract_end must be after contract_start' });
    }
    if (adminPassword && adminPassword.length < 8) {
      return res.status(422).json({ success: false, error: 'Admin password must be at least 8 characters' });
    }

    if (updates.company_code !== undefined) {
      updates.tax_id = normalizeCompanyCode(updates.company_code);
      delete updates.company_code;
      if (!updates.tax_id) return res.status(422).json({ success: false, error: 'company_code cannot be empty' });
      const dup = await Company.findOne({ where: { tax_id: updates.tax_id, id: { [Op.ne]: co.id } } });
      if (dup) return res.status(409).json({ success: false, error: 'company_code already exists' });
    }

    delete updates.password;
    delete updates.enabled_features;

    await co.update(updates);
    if (adminPassword) {
      const roles = await ensureDefaultRoles(co.id);
      const adminEmail = String((updates.email ?? co.email) || '').trim().toLowerCase();
      if (!adminEmail) {
        return res.status(422).json({ success: false, error: 'Admin login email is required when setting admin password' });
      }

      const existingUser = await User.findOne({ where: { email: adminEmail } });
      if (existingUser && existingUser.company_id !== co.id) {
        return res.status(409).json({ success: false, error: `Email ${adminEmail} is already registered` });
      }

      const password_hash = await hashPassword(adminPassword);
      if (existingUser) {
        await existingUser.update({
          company_id: co.id,
          role_id: roles.ADMIN.id,
          password_hash,
          is_active: 1,
        });
      } else {
        await User.create({
          company_id: co.id,
          role_id: roles.ADMIN.id,
          email: adminEmail,
          password_hash,
          is_active: 1,
        });
      }
    }
    if (hasFeaturePayload) {
      await setCompanyFeatures(co.id, enabledFeatures);
    }
    return res.json({ success: true, data: co });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

r.get('/:id/features', async (req, res) => {
  try {
    const co = await Company.findByPk(req.params.id, { attributes: ['id'] });
    if (!co) return res.status(404).json({ success: false, error: 'Company not found' });
    const enabled = await getCompanyEnabledFeatures(co.id);
    return res.json({
      success: true,
      data: {
        available: COMPANY_FEATURES,
        enabled,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

r.put('/:id/features', async (req, res) => {
  try {
    const co = await Company.findByPk(req.params.id, { attributes: ['id'] });
    if (!co) return res.status(404).json({ success: false, error: 'Company not found' });

    const enabled = normalizeFeatureList(req.body?.enabled_features);
    await setCompanyFeatures(co.id, enabled);

    return res.json({
      success: true,
      data: {
        available: COMPANY_FEATURES,
        enabled,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── Upload contract document ──────────────────────────────────────────────────
r.post('/:id/contract-doc', upload.single('file'), async (req, res) => {
  try {
    const co = await Company.findByPk(req.params.id);
    if (!co) return res.status(404).json({ success: false, error: 'Company not found' });
    if (!req.file)  return res.status(422).json({ success: false, error: 'No file uploaded' });

    // Remove old file if exists
    if (co.contract_doc) {
      const oldPath = resolveStoredUploadPath(co.contract_doc);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const relativePath = `uploads/contracts/${req.file.filename}`;
    await co.update({ contract_doc: relativePath });
    return res.json({ success: true, data: { contract_doc: relativePath } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── Toggle active status ──────────────────────────────────────────────────────
r.patch('/:id/status', async (req, res) => {
  try {
    const co = await Company.findByPk(req.params.id);
    if (!co) return res.status(404).json({ success: false, error: 'Company not found' });
    const is_active = req.body.is_active !== undefined ? req.body.is_active : (co.is_active ? 0 : 1);
    await co.update({ is_active });
    return res.json({ success: true, data: co });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── Delete ────────────────────────────────────────────────────────────────────
r.delete('/:id', async (req, res) => {
  try {
    const co = await Company.findByPk(req.params.id);
    if (!co) return res.status(404).json({ success: false, error: 'Company not found' });
    const companyId = co.id;

    await sequelize.transaction(async (tx) => {
      // Optional cleanup for uploaded contract file.
      if (co.contract_doc) {
        const oldPath = resolveStoredUploadPath(co.contract_doc);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }

      // Delete leaf/child tables first, then parent tables.
      await CompanyFeature.destroy({ where: { company_id: companyId }, transaction: tx });
      await Announcement.destroy({ where: { company_id: companyId }, transaction: tx });
      await DeviceLog.destroy({ where: { company_id: companyId }, transaction: tx });
      await Device.destroy({ where: { company_id: companyId }, transaction: tx });

      await PayrollItemComponent.destroy({ where: { company_id: companyId }, transaction: tx });
      await PayrollItem.destroy({ where: { company_id: companyId }, transaction: tx });
      await PayrollRun.destroy({ where: { company_id: companyId }, transaction: tx });
      await EmployeeSalaryComponent.destroy({ where: { company_id: companyId }, transaction: tx });
      await SalaryComponent.destroy({ where: { company_id: companyId }, transaction: tx });

      await LeaveRequest.destroy({ where: { company_id: companyId }, transaction: tx });
      await LeaveBalance.destroy({ where: { company_id: companyId }, transaction: tx });
      await LeaveType.destroy({ where: { company_id: companyId }, transaction: tx });
      await Attendance.destroy({ where: { company_id: companyId }, transaction: tx });

      await User.destroy({ where: { company_id: companyId }, transaction: tx });
      await Employee.destroy({ where: { company_id: companyId }, force: true, transaction: tx });
      await Department.destroy({ where: { company_id: companyId }, transaction: tx });
      await Role.destroy({ where: { company_id: companyId }, transaction: tx });
      await WorkShift.destroy({ where: { company_id: companyId }, transaction: tx });

      await Company.destroy({ where: { id: companyId }, transaction: tx });
    });

    return res.json({ success: true, message: 'Company and all related data deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = r;
