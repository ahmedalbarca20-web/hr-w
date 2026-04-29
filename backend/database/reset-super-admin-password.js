/**
 * database/reset-super-admin-password.js
 *
 * Resets the platform super-admin password and normalizes the account:
 *   role_id → SUPER_ADMIN, company_id NULL, employee_id NULL, is_active,
 *   refresh_token cleared.
 *
 * Does NOT insert a new role row (some DBs enforce NOT NULL on roles.company_id).
 * If no SUPER_ADMIN role exists, run first:
 *   node database/seed.super-admin.js
 *
 * Usage (from backend/, with DATABASE_URL / DB_* in .env):
 *   npm run seed:super-admin-reset
 *
 * Env (optional):
 *   SUPER_ADMIN_EMAIL    default ahmedalbarca20@gmail.com
 *   SUPER_ADMIN_PASSWORD default Super@1234
 */

'use strict';

require('dotenv').config();

const { sequelize } = require('../src/config/db');
const { QueryTypes } = require('sequelize');
const User = require('../src/models/user.model');
const { hashPassword } = require('../src/utils/hash');

const SUPER_ADMIN_ROLE = 'SUPER_ADMIN';
const EMAIL = String(process.env.SUPER_ADMIN_EMAIL || 'ahmedalbarca20@gmail.com').trim().toLowerCase();
const PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'Super@1234';

async function getSuperAdminRoleId() {
  const preferGlobal = await sequelize.query(
    `SELECT id FROM roles WHERE name = :name AND company_id IS NULL LIMIT 1`,
    { replacements: { name: SUPER_ADMIN_ROLE }, type: QueryTypes.SELECT },
  );
  if (preferGlobal.length) return preferGlobal[0].id;

  const any = await sequelize.query(
    `SELECT id FROM roles WHERE name = :name ORDER BY id ASC LIMIT 1`,
    { replacements: { name: SUPER_ADMIN_ROLE }, type: QueryTypes.SELECT },
  );
  return any.length ? any[0].id : null;
}

async function run() {
  if (!EMAIL) {
    // eslint-disable-next-line no-console
    console.error('❌  SUPER_ADMIN_EMAIL is empty');
    process.exit(1);
  }
  if (!PASSWORD || String(PASSWORD).length < 6) {
    // eslint-disable-next-line no-console
    console.error('❌  SUPER_ADMIN_PASSWORD missing or too short');
    process.exit(1);
  }

  try {
    await sequelize.authenticate();
    // eslint-disable-next-line no-console
    console.log('✅  DB connected');

    const roleId = await getSuperAdminRoleId();
    if (!roleId) {
      // eslint-disable-next-line no-console
      console.error(`❌  No role named ${SUPER_ADMIN_ROLE}. Run: node database/seed.super-admin.js`);
      process.exit(1);
    }

    const password_hash = await hashPassword(PASSWORD);
    const existing = await User.findOne({ where: { email: EMAIL } });

    if (existing) {
      await existing.update({
        password_hash,
        role_id: roleId,
        company_id: null,
        employee_id: null,
        is_active: 1,
        refresh_token: null,
      });
      // eslint-disable-next-line no-console
      console.log(`✅  Updated super-admin user id=${existing.id} (${EMAIL})`);
    } else {
      const created = await User.create({
        company_id: null,
        employee_id: null,
        role_id: roleId,
        email: EMAIL,
        password_hash,
        is_active: 1,
      });
      // eslint-disable-next-line no-console
      console.log(`✅  Created super-admin user id=${created.id} (${EMAIL})`);
    }

    // eslint-disable-next-line no-console
    console.log('\nDone. Log in with this email; all old refresh sessions were cleared.\n');
    await sequelize.close();
    process.exit(0);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('❌  Error:', err.message);
    process.exit(1);
  }
}

run();
