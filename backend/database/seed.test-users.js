/**
 * database/seed.test-users.js
 *
 * Seeds a full set of test accounts (one per role + one per contract type).
 * Safe to run multiple times — skips rows that already exist.
 *
 * Usage:
 *   node database/seed.test-users.js
 *
 * ┌──────────────────────────────┬────────────────────────────┬───────────────┬──────────────────┐
 * │ Email                        │ Role                       │ Contract Type │ Password         │
 * ├──────────────────────────────┼────────────────────────────┼───────────────┼──────────────────┤
 * │ admin@hr.com                 │ ADMIN  (full access)       │ —             │ Admin@1234       │
 * │ hr@hr.com                    │ HR     (HR manager)        │ FULL_TIME     │ Test@1234        │
 * │ fulltime@hr.com              │ EMPLOYEE                   │ FULL_TIME     │ Test@1234        │
 * │ parttime@hr.com              │ EMPLOYEE                   │ PART_TIME     │ Test@1234        │
 * │ contractor@hr.com            │ EMPLOYEE                   │ CONTRACT      │ Test@1234        │
 * │ intern@hr.com                │ EMPLOYEE                   │ INTERN        │ Test@1234        │
 * └──────────────────────────────┴────────────────────────────┴───────────────┴──────────────────┘
 */

'use strict';

require('dotenv').config();

const bcrypt        = require('bcryptjs');
const { sequelize } = require('../src/config/db');
const { QueryTypes } = require('sequelize');

const ROUNDS       = 12;
const DEFAULT_PASS = 'Test@1234';
const ADMIN_PASS   = process.env.SEED_PASSWORD || 'Admin@1234';

// ─── helpers ──────────────────────────────────────────────────────────────────

async function firstRow(sql, replacements = []) {
  const [row] = await sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
  return row || null;
}

async function insert(sql, replacements = []) {
  const [result] = await sequelize.query(sql, { replacements, type: QueryTypes.INSERT });
  return result; // insert-id
}

async function ensureUser({ companyId, roleId, email, password, employeeId = null }) {
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await firstRow(
    `SELECT id FROM users WHERE email = ?`,
    [normalizedEmail]
  );
  if (existing) {
    console.log(`  ⏭   User already exists            → ${normalizedEmail}`);
    return existing.id;
  }
  const hash = await bcrypt.hash(password, ROUNDS);
  const id = await insert(
    `INSERT INTO users (company_id, employee_id, role_id, email, password_hash, is_active)
     VALUES (?, ?, ?, ?, ?, 1)`,
    [companyId, employeeId, roleId, normalizedEmail, hash]
  );
  console.log(`  ✅  User created                    → ${normalizedEmail}`);
  return id;
}

async function ensureEmployee({
  companyId, deptId, positionId, managerId,
  empNumber, firstName, lastName, firstNameAr, lastNameAr,
  email, contractType, baseSalary, gender = 'MALE',
}) {
  const existing = await firstRow(
    `SELECT id FROM employees WHERE company_id = ? AND employee_number = ? AND deleted_at IS NULL`,
    [companyId, empNumber]
  );
  if (existing) {
    console.log(`  ⏭   Employee already exists        → ${empNumber} ${firstName} ${lastName}`);
    return existing.id;
  }
  const id = await insert(
    `INSERT INTO employees
       (company_id, employee_number, first_name, last_name, first_name_ar, last_name_ar,
        gender, hire_date, contract_type, status, department_id, position_id, manager_id,
        email, base_salary)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE(), ?, 'ACTIVE', ?, ?, ?, ?, ?)`,
    [
      companyId, empNumber, firstName, lastName, firstNameAr, lastNameAr,
      gender, contractType, deptId, positionId, managerId, email, baseSalary,
    ]
  );
  console.log(`  ✅  Employee created                → ${empNumber} ${firstName} ${lastName} [${contractType}]`);
  return id;
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function run() {
  try {
    await sequelize.authenticate();
    console.log('✅  DB connected\n');

    // ── 1. Company ───────────────────────────────────────────────────────────
    console.log('── Company ──────────────────────────────────────');
    let company = await firstRow(`SELECT id FROM companies LIMIT 1`);
    let companyId;
    const today       = new Date().toISOString().slice(0, 10);
    const oneYearOut  = new Date();
    oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);
    const contractEnd = oneYearOut.toISOString().slice(0, 10);

    if (company) {
      companyId = company.id;
      console.log(`  ⏭   Company already exists         (id=${companyId})`);
    } else {
      companyId = await insert(
        `INSERT INTO companies (name, name_ar, currency, timezone, contract_start, contract_end)
         VALUES ('', '', 'IQD', 'Asia/Baghdad', ?, ?)`
        , [today, contractEnd]
      );
      console.log(`  ✅  Company created                 (id=${companyId})`);
    }

    // ── 2. Roles ─────────────────────────────────────────────────────────────
    console.log('\n── Roles ────────────────────────────────────────');
    const roleDefs = [
      {
        name: 'ADMIN', name_ar: 'مدير النظام',
        permissions: JSON.stringify(['*']),
      },
      {
        name: 'HR', name_ar: 'الموارد البشرية',
        permissions: JSON.stringify([
          'employees:*', 'attendance:*', 'leaves:*',
          'payroll:read', 'departments:read', 'reports:read',
        ]),
      },
      {
        name: 'EMPLOYEE', name_ar: 'موظف',
        permissions: JSON.stringify([
          'profile:read', 'leaves:request', 'attendance:self', 'payroll:self',
        ]),
      },
    ];

    const roleIds = {};
    for (const r of roleDefs) {
      const existing = await firstRow(
        `SELECT id FROM roles WHERE company_id = ? AND name = ?`,
        [companyId, r.name]
      );
      if (existing) {
        console.log(`  ⏭   Role already exists            → ${r.name} (id=${existing.id})`);
        roleIds[r.name] = existing.id;
      } else {
        const id = await insert(
          `INSERT INTO roles (company_id, name, name_ar, permissions, is_system)
           VALUES (?, ?, ?, ?, 1)`,
          [companyId, r.name, r.name_ar, r.permissions]
        );
        console.log(`  ✅  Role created                   → ${r.name} (id=${id})`);
        roleIds[r.name] = id;
      }
    }

    // ── 3. Departments ───────────────────────────────────────────────────────
    console.log('\n── Departments ──────────────────────────────────');
    const deptDefs = [
      { name: 'Human Resources',  name_ar: 'الموارد البشرية' },
      { name: 'Information Technology', name_ar: 'تقنية المعلومات' },
      { name: 'Finance',          name_ar: 'المالية' },
      { name: 'Operations',       name_ar: 'العمليات' },
    ];
    const deptIds = {};
    for (const d of deptDefs) {
      const existing = await firstRow(
        `SELECT id FROM departments WHERE company_id = ? AND name = ?`,
        [companyId, d.name]
      );
      if (existing) {
        console.log(`  ⏭   Department already exists      → ${d.name} (id=${existing.id})`);
        deptIds[d.name] = existing.id;
      } else {
        const id = await insert(
          `INSERT INTO departments (company_id, name, name_ar, is_active)
           VALUES (?, ?, ?, 1)`,
          [companyId, d.name, d.name_ar]
        );
        console.log(`  ✅  Department created             → ${d.name} (id=${id})`);
        deptIds[d.name] = id;
      }
    }

    // ── 4. Positions ─────────────────────────────────────────────────────────
    console.log('\n── Positions ────────────────────────────────────');
    const posDefs = [
      { title: 'HR Manager',     title_ar: 'مدير الموارد البشرية', dept: 'Human Resources'       },
      { title: 'Software Engineer', title_ar: 'مهندس برمجيات',    dept: 'Information Technology' },
      { title: 'Part-time Clerk', title_ar: 'موظف جزئي',          dept: 'Operations'             },
      { title: 'Contractor',     title_ar: 'متعاقد',              dept: 'Information Technology' },
      { title: 'Intern',         title_ar: 'متدرب',               dept: 'Information Technology' },
    ];
    const posIds = {};
    for (const p of posDefs) {
      const existing = await firstRow(
        `SELECT id FROM positions WHERE company_id = ? AND title = ?`,
        [companyId, p.title]
      );
      if (existing) {
        console.log(`  ⏭   Position already exists        → ${p.title} (id=${existing.id})`);
        posIds[p.title] = existing.id;
      } else {
        const id = await insert(
          `INSERT INTO positions (company_id, department_id, title, title_ar, is_active)
           VALUES (?, ?, ?, ?, 1)`,
          [companyId, deptIds[p.dept], p.title, p.title_ar]
        );
        console.log(`  ✅  Position created               → ${p.title} (id=${id})`);
        posIds[p.title] = id;
      }
    }

    // ── 5. Employees + Users ─────────────────────────────────────────────────
    console.log('\n── Employees & Users ────────────────────────────');

    // 5-a. Admin (no employee record)
    await ensureUser({
      companyId, roleId: roleIds['ADMIN'],
      email: 'admin@hr.com', password: ADMIN_PASS,
    });

    // 5-b. HR Manager
    const hrEmpId = await ensureEmployee({
      companyId,
      deptId     : deptIds['Human Resources'],
      positionId : posIds['HR Manager'],
      managerId  : null,
      empNumber  : 'EMP-001',
      firstName  : 'Sara',        lastName     : 'Al-Harbi',
      firstNameAr: 'سارة',        lastNameAr   : 'الحربي',
      email      : 'hr@hr.com',
      contractType: 'FULL_TIME',
      baseSalary : 12000.00,
      gender     : 'FEMALE',
    });
    await ensureUser({
      companyId, roleId: roleIds['HR'],
      email: 'hr@hr.com', password: DEFAULT_PASS, employeeId: hrEmpId,
    });

    // 5-c. Full-time employee
    const ftEmpId = await ensureEmployee({
      companyId,
      deptId     : deptIds['Information Technology'],
      positionId : posIds['Software Engineer'],
      managerId  : hrEmpId,
      empNumber  : 'EMP-002',
      firstName  : 'Ahmed',       lastName     : 'Al-Qahtani',
      firstNameAr: 'أحمد',        lastNameAr   : 'القحطاني',
      email      : 'fulltime@hr.com',
      contractType: 'FULL_TIME',
      baseSalary : 9500.00,
    });
    await ensureUser({
      companyId, roleId: roleIds['EMPLOYEE'],
      email: 'fulltime@hr.com', password: DEFAULT_PASS, employeeId: ftEmpId,
    });

    // 5-d. Part-time employee
    const ptEmpId = await ensureEmployee({
      companyId,
      deptId     : deptIds['Operations'],
      positionId : posIds['Part-time Clerk'],
      managerId  : hrEmpId,
      empNumber  : 'EMP-003',
      firstName  : 'Nora',        lastName     : 'Al-Shehri',
      firstNameAr: 'نورة',        lastNameAr   : 'الشهري',
      email      : 'parttime@hr.com',
      contractType: 'PART_TIME',
      baseSalary : 4000.00,
      gender     : 'FEMALE',
    });
    await ensureUser({
      companyId, roleId: roleIds['EMPLOYEE'],
      email: 'parttime@hr.com', password: DEFAULT_PASS, employeeId: ptEmpId,
    });

    // 5-e. Contractor
    const conEmpId = await ensureEmployee({
      companyId,
      deptId     : deptIds['Information Technology'],
      positionId : posIds['Contractor'],
      managerId  : hrEmpId,
      empNumber  : 'EMP-004',
      firstName  : 'Khalid',      lastName     : 'Al-Zahrani',
      firstNameAr: 'خالد',        lastNameAr   : 'الزهراني',
      email      : 'contractor@hr.com',
      contractType: 'CONTRACT',
      baseSalary : 7000.00,
    });
    await ensureUser({
      companyId, roleId: roleIds['EMPLOYEE'],
      email: 'contractor@hr.com', password: DEFAULT_PASS, employeeId: conEmpId,
    });

    // 5-f. Intern
    const intEmpId = await ensureEmployee({
      companyId,
      deptId     : deptIds['Information Technology'],
      positionId : posIds['Intern'],
      managerId  : hrEmpId,
      empNumber  : 'EMP-005',
      firstName  : 'Layan',       lastName     : 'Al-Dosari',
      firstNameAr: 'ليان',        lastNameAr   : 'الدوسري',
      email      : 'intern@hr.com',
      contractType: 'INTERN',
      baseSalary : 2000.00,
      gender     : 'FEMALE',
    });
    await ensureUser({
      companyId, roleId: roleIds['EMPLOYEE'],
      email: 'intern@hr.com', password: DEFAULT_PASS, employeeId: intEmpId,
    });

    // ── Summary ───────────────────────────────────────────────────────────────
    console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                    TEST ACCOUNTS — SUMMARY                          ║
╠══════════════════╦══════════════════════╦══════════════╦════════════╣
║ Email            ║ Role                 ║ Contract     ║ Password   ║
╠══════════════════╬══════════════════════╬══════════════╬════════════╣
║ admin@hr.com     ║ ADMIN (full access)  ║ —            ║ Admin@1234 ║
║ hr@hr.com        ║ HR Manager           ║ FULL_TIME    ║ Test@1234  ║
║ fulltime@hr.com  ║ Employee             ║ FULL_TIME    ║ Test@1234  ║
║ parttime@hr.com  ║ Employee             ║ PART_TIME    ║ Test@1234  ║
║ contractor@hr.com║ Employee             ║ CONTRACT     ║ Test@1234  ║
║ intern@hr.com    ║ Employee             ║ INTERN       ║ Test@1234  ║
╚══════════════════╩══════════════════════╩══════════════╩════════════╝
`);

    await sequelize.close();
    process.exit(0);
  } catch (err) {
    console.error('\n❌  Seed failed:', err.message);
    console.error(err);
    process.exit(1);
  }
}

run();
