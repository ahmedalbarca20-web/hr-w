/**
 * database/seed.js — seeds a demo company, roles, and an ADMIN user.
 *
 * Usage:
 *   node database/seed.js
 *
 * Default credentials created:
 *   Email    : admin@hr.com
 *   Password : Admin@1234
 */

'use strict';

require('dotenv').config();

const bcrypt     = require('bcryptjs');
const { sequelize } = require('../src/config/db');
const { QueryTypes } = require('sequelize');

const EMAIL    = process.env.SEED_EMAIL    || 'admin@hr.com';
const PASSWORD = process.env.SEED_PASSWORD || 'Admin@1234';
const ROUNDS   = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);

async function run() {
  try {
    await sequelize.authenticate();
    console.log('✅  DB connected');

    // ── 1. Company ──────────────────────────────────────────────
    const [companyRows] = await sequelize.query(
      `SELECT id FROM companies LIMIT 1`,
      { type: QueryTypes.SELECT }
    );

    let companyId;
    if (companyRows) {
      companyId = companyRows.id;
      console.log(`ℹ️   Company already exists  (id=${companyId})`);
    } else {
      const [result] = await sequelize.query(
        `INSERT INTO companies (name, name_ar, currency, timezone)
         VALUES ('', '', 'IQD', 'Asia/Baghdad')`,
        { type: QueryTypes.INSERT }
      );
      companyId = result;
      console.log(`✅  Company created  (id=${companyId})`);
    }

    // ── 2. Roles ─────────────────────────────────────────────────
    const rolesToCreate = [
      { name: 'ADMIN',    name_ar: 'مدير النظام',  is_system: 1, permissions: JSON.stringify(['*']) },
      { name: 'HR',       name_ar: 'الموارد البشرية', is_system: 1, permissions: JSON.stringify(['employees:*','attendance:*','leaves:*','payroll:read']) },
      { name: 'EMPLOYEE', name_ar: 'موظف',          is_system: 1, permissions: JSON.stringify(['profile:read','leaves:request','attendance:self']) },
    ];

    for (const role of rolesToCreate) {
      const [existing] = await sequelize.query(
        `SELECT id FROM roles WHERE company_id = ? AND name = ?`,
        { replacements: [companyId, role.name], type: QueryTypes.SELECT }
      );
      if (existing) {
        console.log(`ℹ️   Role ${role.name} already exists  (id=${existing.id})`);
      } else {
        await sequelize.query(
          `INSERT INTO roles (company_id, name, name_ar, permissions, is_system)
           VALUES (?, ?, ?, ?, ?)`,
          { replacements: [companyId, role.name, role.name_ar, role.permissions, role.is_system] }
        );
        console.log(`✅  Role ${role.name} created`);
      }
    }

    // ── 3. Default leave types ────────────────────────────────────
    const [ltCountRow] = await sequelize.query(
      `SELECT COUNT(*) AS cnt FROM leave_types WHERE company_id = ?`,
      { replacements: [companyId], type: QueryTypes.SELECT }
    );

    if (!ltCountRow || Number(ltCountRow.cnt) === 0) {
      console.log('ℹ️   No leave types found — seeding defaults');
      const leaveTypes = [
        {
          name: 'Annual Leave', name_ar: 'إجازة سنوية',
          max_days_per_year: 30, is_paid: 1,
          carry_forward: 1, max_carry_days: 10,
          requires_approval: 1, gender_specific: 'ALL',
        },
        {
          name: 'Sick Leave', name_ar: 'إجازة مرضية',
          max_days_per_year: 10, is_paid: 1,
          carry_forward: 0, max_carry_days: 0,
          requires_approval: 1, gender_specific: 'ALL',
        },
        {
          name: 'Unpaid Leave', name_ar: 'إجازة بدون راتب',
          max_days_per_year: 0, is_paid: 0,
          carry_forward: 0, max_carry_days: 0,
          requires_approval: 1, gender_specific: 'ALL',
        },
        {
          name: 'Maternity Leave', name_ar: 'إجازة أمومة',
          max_days_per_year: 90, is_paid: 1,
          carry_forward: 0, max_carry_days: 0,
          requires_approval: 1, gender_specific: 'FEMALE',
        },
        {
          name: 'Paternity Leave', name_ar: 'إجازة أبوة',
          max_days_per_year: 5, is_paid: 1,
          carry_forward: 0, max_carry_days: 0,
          requires_approval: 1, gender_specific: 'MALE',
        },
      ];

      for (const lt of leaveTypes) {
        await sequelize.query(
          `INSERT INTO leave_types
             (company_id, name, name_ar, max_days_per_year, is_paid, carry_forward, max_carry_days, requires_approval, gender_specific, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          {
            replacements: [
              companyId,
              lt.name,
              lt.name_ar,
              lt.max_days_per_year,
              lt.is_paid,
              lt.carry_forward,
              lt.max_carry_days,
              lt.requires_approval,
              lt.gender_specific,
            ],
          }
        );
      }
      console.log(`✅  Seeded ${leaveTypes.length} default leave types`);
    } else {
      console.log(`ℹ️   ${ltCountRow.cnt} leave types already exist – skipping seeding`);
    }

    // ── 4. Admin user ─────────────────────────────────────────────
    const [adminRole] = await sequelize.query(
      `SELECT id FROM roles WHERE company_id = ? AND name = 'ADMIN'`,
      { replacements: [companyId], type: QueryTypes.SELECT }
    );

    if (!adminRole) {
      throw new Error('ADMIN role not found — should have been created above');
    }

    const [existingUser] = await sequelize.query(
      `SELECT id FROM users WHERE company_id = ? AND email = ?`,
      { replacements: [companyId, EMAIL], type: QueryTypes.SELECT }
    );

    if (existingUser) {
      console.log(`ℹ️   User ${EMAIL} already exists  (id=${existingUser.id})`);
    } else {
      const hash = await bcrypt.hash(PASSWORD, ROUNDS);
      await sequelize.query(
        `INSERT INTO users (company_id, role_id, email, password_hash, is_active)
         VALUES (?, ?, ?, ?, 1)`,
        { replacements: [companyId, adminRole.id, EMAIL, hash] }
      );
      console.log(`✅  Admin user created`);
    }

    console.log('\n─────────────────────────────────────────────');
    console.log('  Login credentials');
    console.log('─────────────────────────────────────────────');
    console.log(`  Email   :  ${EMAIL}`);
    console.log(`  Password:  ${PASSWORD}`);
    console.log('─────────────────────────────────────────────\n');

    await sequelize.close();
    process.exit(0);
  } catch (err) {
    console.error('❌  Seed failed:', err.message);
    process.exit(1);
  }
}

run();
