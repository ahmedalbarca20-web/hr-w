'use strict';

require('dotenv').config();

const bcrypt = require('bcryptjs');
const { Op, QueryTypes } = require('sequelize');
const { sequelize } = require('../src/config/db');
const Employee = require('../src/models/employee.model');
const Attendance = require('../src/models/attendance.model');
const User = require('../src/models/user.model');
const Role = require('../src/models/role.model');
const { LeaveType, LeaveBalance, LeaveRequest } = require('../src/models/leave.model');

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || 'Demo@1234';
const ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);

function toDateOnly(d) {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function ensureEmployeeRole(companyId) {
  let role = await Role.findOne({ where: { company_id: companyId, name: 'EMPLOYEE' } });
  if (!role) {
    role = await Role.create({
      company_id: companyId,
      name: 'EMPLOYEE',
      name_ar: 'موظف',
      permissions: ['profile:read', 'leaves:request', 'attendance:self'],
      is_system: 1,
    });
  }
  return role;
}

async function ensureLeaveTypes(companyId) {
  const existing = await LeaveType.findAll({ where: { company_id: companyId } });
  if (existing.length > 0) return existing;
  await LeaveType.bulkCreate([
    { company_id: companyId, name: 'Annual Leave', name_ar: 'إجازة سنوية', max_days_per_year: 30, is_paid: 1, carry_forward: 1, max_carry_days: 10, requires_approval: 1, gender_specific: 'ALL', is_active: 1 },
    { company_id: companyId, name: 'Sick Leave', name_ar: 'إجازة مرضية', max_days_per_year: 10, is_paid: 1, carry_forward: 0, max_carry_days: 0, requires_approval: 1, gender_specific: 'ALL', is_active: 1 },
  ]);
  return LeaveType.findAll({ where: { company_id: companyId } });
}

async function upsertEmployee(companyId, data) {
  const existing = await Employee.findOne({
    where: { company_id: companyId, employee_number: data.employee_number },
  });
  if (existing) {
    await existing.update(data);
    return existing;
  }
  return Employee.create({ ...data, company_id: companyId });
}

async function ensureUserForEmployee(companyId, employeeRoleId, employee, email, passwordHash) {
  const existing = await User.findOne({ where: { company_id: companyId, employee_id: employee.id } });
  if (existing) {
    await existing.update({
      role_id: employeeRoleId,
      email,
      password_hash: passwordHash,
      is_active: 1,
    });
    return existing;
  }
  return User.create({
    company_id: companyId,
    employee_id: employee.id,
    role_id: employeeRoleId,
    email,
    password_hash: passwordHash,
    is_active: 1,
  });
}

async function seedAttendance(companyId, employeeId) {
  const rows = [];
  for (let i = 1; i <= 28; i += 1) {
    const d = daysAgo(i);
    const day = d.getDay();
    const work_date = toDateOnly(d);

    // Friday weekend in many local setups.
    if (day === 5) {
      rows.push({
        company_id: companyId,
        employee_id: employeeId,
        work_date,
        status: 'WEEKEND',
        source: 'MANUAL',
        total_minutes: 0,
        overtime_minutes: 0,
        late_minutes: 0,
      });
      continue;
    }

    // Deterministic realistic pattern for demo.
    if (i % 11 === 0) {
      rows.push({
        company_id: companyId,
        employee_id: employeeId,
        work_date,
        status: 'ABSENT',
        source: 'MANUAL',
        total_minutes: 0,
        overtime_minutes: 0,
        late_minutes: 0,
      });
      continue;
    }

    const checkIn = new Date(`${work_date}T08:${i % 3 === 0 ? '20' : '05'}:00`);
    const checkOut = new Date(`${work_date}T16:${i % 4 === 0 ? '45' : '15'}:00`);
    const totalMinutes = Math.max(0, Math.round((checkOut - checkIn) / 60000));
    const isLate = i % 3 === 0;

    rows.push({
      company_id: companyId,
      employee_id: employeeId,
      work_date,
      check_in: checkIn,
      check_out: checkOut,
      total_minutes: totalMinutes,
      overtime_minutes: i % 4 === 0 ? 30 : 0,
      late_minutes: isLate ? 20 : 0,
      status: isLate ? 'LATE' : 'PRESENT',
      source: 'MANUAL',
    });
  }

  for (const r of rows) {
    const exists = await Attendance.findOne({
      where: { company_id: r.company_id, employee_id: r.employee_id, work_date: r.work_date },
    });
    if (exists) {
      await exists.update(r);
    } else {
      await Attendance.create(r);
    }
  }
}

async function seedLeaveData(companyId, employeeId, annualType, sickType, approverUserId) {
  const year = new Date().getFullYear();

  const balances = [
    { leave_type_id: annualType.id, total_days: 30, used_days: 6, pending_days: 2 },
    { leave_type_id: sickType.id, total_days: 10, used_days: 1, pending_days: 0 },
  ];

  for (const b of balances) {
    const existing = await LeaveBalance.findOne({
      where: { company_id: companyId, employee_id: employeeId, leave_type_id: b.leave_type_id, year },
    });
    if (existing) await existing.update(b);
    else await LeaveBalance.create({ company_id: companyId, employee_id: employeeId, year, ...b });
  }

  const requests = [
    {
      leave_type_id: annualType.id,
      start_date: `${year}-02-10`,
      end_date: `${year}-02-12`,
      total_days: 3,
      reason: 'Demo approved annual leave',
      status: 'APPROVED',
      approved_by: approverUserId || null,
      approved_at: new Date(),
    },
    {
      leave_type_id: sickType.id,
      start_date: `${year}-03-15`,
      end_date: `${year}-03-15`,
      total_days: 1,
      reason: 'Demo pending sick leave',
      status: 'PENDING',
      approved_by: null,
      approved_at: null,
    },
  ];

  for (const req of requests) {
    const existing = await LeaveRequest.findOne({
      where: {
        company_id: companyId,
        employee_id: employeeId,
        start_date: req.start_date,
        end_date: req.end_date,
        reason: req.reason,
      },
    });
    if (existing) {
      await existing.update(req);
    } else {
      await LeaveRequest.create({ company_id: companyId, employee_id: employeeId, ...req });
    }
  }
}

async function run() {
  try {
    await sequelize.authenticate();

    const company = await sequelize.query(
      `SELECT id
       FROM companies
       WHERE is_active IS NULL OR is_active != 0
       ORDER BY id ASC
       LIMIT 1`,
      { type: QueryTypes.SELECT }
    );
    if (!company?.[0]?.id) throw new Error('No company found. Run base seed first.');

    const companyId = company[0].id;
    const employeeRole = await ensureEmployeeRole(companyId);
    const roles = await Role.findAll({ where: { company_id: companyId } });
    const adminRole = roles.find((r) => r.name === 'ADMIN') || roles.find((r) => r.name === 'HR');
    const approver = adminRole
      ? await User.findOne({ where: { company_id: companyId, role_id: adminRole.id } })
      : null;

    const leaveTypes = await ensureLeaveTypes(companyId);
    const annualType = leaveTypes.find((l) => l.name === 'Annual Leave') || leaveTypes[0];
    const sickType = leaveTypes.find((l) => l.name === 'Sick Leave') || leaveTypes[0];
    if (!annualType || !sickType) throw new Error('Leave types are missing');

    const employeesSeed = [
      {
        employee_number: 'EMP-1001',
        first_name: 'Ali',
        last_name: 'Hassan',
        first_name_ar: 'علي',
        last_name_ar: 'حسن',
        gender: 'MALE',
        hire_date: '2023-09-01',
        contract_type: 'FULL_TIME',
        status: 'ACTIVE',
        phone: '07701234567',
        email: 'ali.hassan@demo-hr.local',
        nationality: 'Iraqi',
        base_salary: 1200000,
      },
      {
        employee_number: 'EMP-1002',
        first_name: 'Sara',
        last_name: 'Mahdi',
        first_name_ar: 'سارة',
        last_name_ar: 'مهدي',
        gender: 'FEMALE',
        hire_date: '2024-01-15',
        contract_type: 'FULL_TIME',
        status: 'ACTIVE',
        phone: '07707654321',
        email: 'sara.mahdi@demo-hr.local',
        nationality: 'Iraqi',
        base_salary: 1350000,
      },
      {
        employee_number: 'EMP-1003',
        first_name: 'Omar',
        last_name: 'Kareem',
        first_name_ar: 'عمر',
        last_name_ar: 'كريم',
        gender: 'MALE',
        hire_date: '2022-11-10',
        contract_type: 'FULL_TIME',
        status: 'ACTIVE',
        phone: '07801112233',
        email: 'omar.kareem@demo-hr.local',
        nationality: 'Iraqi',
        base_salary: 1500000,
      },
    ];

    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, ROUNDS);
    const created = [];

    for (const e of employeesSeed) {
      const emp = await upsertEmployee(companyId, e);
      await ensureUserForEmployee(companyId, employeeRole.id, emp, e.email, passwordHash);
      await seedAttendance(companyId, emp.id);
      await seedLeaveData(companyId, emp.id, annualType, sickType, approver?.id || null);
      created.push({ employee_number: emp.employee_number, name: `${emp.first_name} ${emp.last_name}`, email: e.email });
    }

    console.log('✅ Demo employees and transactions seeded successfully');
    console.log(`Company ID: ${companyId}`);
    console.log(`Employee login password: ${DEMO_PASSWORD}`);
    console.table(created);
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed demo failed:', err.message);
    process.exit(1);
  }
}

run();
