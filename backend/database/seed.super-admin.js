/**
 * database/seed.super-admin.js
 *
 * Creates the SUPER_ADMIN system role (company_id = NULL) and a super-admin user.
 * Safe to run multiple times — skips rows that already exist.
 *
 * Usage:
 *   node database/seed.super-admin.js
 *
 * Default email (override with SUPER_ADMIN_EMAIL):
 *   ahmedalbarca20@gmail.com
 * Password: set SUPER_ADMIN_PASSWORD in backend/.env — do not commit real passwords.
 * Dev fallback only: Super@1234
 */

'use strict';

require('dotenv').config();

const bcrypt        = require('bcryptjs');
const { sequelize } = require('../src/config/db');
const { QueryTypes } = require('sequelize');

const EMAIL    = process.env.SUPER_ADMIN_EMAIL    || 'ahmedalbarca20@gmail.com';
const PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'Super@1234';
const ROUNDS   = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);

async function run() {
  try {
    await sequelize.authenticate();
    console.log('✅  DB connected');

    // ── 1. Ensure SUPER_ADMIN role (company_id IS NULL) ──────────────────────
    const existingRole = await sequelize.query(
      `SELECT id FROM roles WHERE company_id IS NULL AND name = 'SUPER_ADMIN'`,
      { type: QueryTypes.SELECT }
    );

    let roleId;
    if (existingRole.length > 0) {
      roleId = existingRole[0].id;
      console.log(`ℹ️   SUPER_ADMIN role already exists (id=${roleId})`);
    } else {
      const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
      const [result] = await sequelize.query(
        `INSERT INTO roles (company_id, name, name_ar, permissions, is_system, created_at, updated_at)
         VALUES (NULL, 'SUPER_ADMIN', 'الأدمن الرئيسي', '["*"]', 1, '${now}', '${now}')`,
        { type: QueryTypes.INSERT }
      );
      roleId = result;
      console.log(`✅  SUPER_ADMIN role created (id=${roleId})`);
    }

    // ── 2. Ensure super-admin user (company_id IS NULL) ──────────────────────
    const existingUser = await sequelize.query(
      `SELECT id FROM users WHERE company_id IS NULL AND email = ?`,
      { replacements: [EMAIL], type: QueryTypes.SELECT }
    );

    if (existingUser.length > 0) {
      console.log(`ℹ️   Super-admin user already exists (id=${existingUser[0].id})`);
    } else {
      const hash = await bcrypt.hash(PASSWORD, ROUNDS);
      const now2 = new Date().toISOString().replace('T', ' ').substring(0, 19);
      const [userId] = await sequelize.query(
        `INSERT INTO users (company_id, employee_id, role_id, email, password_hash, is_active, created_at, updated_at)
         VALUES (NULL, NULL, ?, ?, ?, 1, '${now2}', '${now2}')`,
        { replacements: [roleId, EMAIL, hash], type: QueryTypes.INSERT }
      );
      console.log(`✅  Super-admin user created (id=${userId})`);
    }

    console.log('\n─────────────────────────────────────────────');
    console.log('  Super-Admin credentials');
    console.log('  Email   :', EMAIL);
    console.log('  Password:', PASSWORD);
    console.log('─────────────────────────────────────────────\n');

    await sequelize.close();
    process.exit(0);
  } catch (err) {
    console.error('❌  Error:', err.message);
    process.exit(1);
  }
}

run();
