'use strict';

/**
 * database/init-sqlite.js
 * Initializes SQLite database using Sequelize sync and seeds admin data.
 * Usage:  node database/init-sqlite.js
 */

require('dotenv').config();

const path   = require('path');
const fs     = require('fs');
const bcrypt = require('bcryptjs');

const dbPath = process.env.DB_STORAGE
  ? path.resolve(process.cwd(), process.env.DB_STORAGE)
  : path.join(__dirname, 'hr_dev.sqlite');

// Remove old db if it exists
if (fs.existsSync(dbPath)) {
  try { fs.unlinkSync(dbPath); console.log('[init] Old database removed'); }
  catch (e) { console.error('[init] Cannot remove old db:', e.message); }
}

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const { QueryTypes } = require('sequelize');
const EMAIL    = process.env.SEED_EMAIL    || 'admin@hr.com';
const PASSWORD = process.env.SEED_PASSWORD || 'Admin@1234';

async function run() {
  try {
    const { sequelize } = require('../src/config/db');
    require('../src/models/index');

    await sequelize.authenticate();
    console.log('[init] Connected to SQLite at:', dbPath);

    await sequelize.sync({ force: true });
    console.log('[init] All tables created');

    // Company
    let [existing] = await sequelize.query(
      'SELECT id FROM companies LIMIT 1',
      { type: QueryTypes.SELECT }
    );

    let companyId;
    if (existing) {
      companyId = existing.id;
    } else {
      await sequelize.query(
        "INSERT INTO companies (name, name_ar, currency, timezone, is_active, created_at, updated_at) VALUES ('', '', 'IQD', 'Asia/Baghdad', 1, datetime('now'), datetime('now'))"
      );
      [{ id: companyId }] = await sequelize.query(
        'SELECT id FROM companies ORDER BY id DESC LIMIT 1',
        { type: QueryTypes.SELECT }
      );
      console.log('[init] Company created id=' + companyId);
    }

    // Roles
    const roles = [
      { name: 'ADMIN',    nameAr: '\u0645\u062f\u064a\u0631 \u0627\u0644\u0646\u0638\u0627\u0645', perm: '["*"]' },
      { name: 'HR',       nameAr: '\u0645\u0648\u0627\u0631\u062f \u0628\u0634\u0631\u064a\u0629',  perm: '["employees:*","attendance:*","leaves:*","payroll:read"]' },
      { name: 'EMPLOYEE', nameAr: '\u0645\u0648\u0638\u0641',                                       perm: '["profile:read","leaves:request","attendance:self"]' },
    ];

    for (const r of roles) {
      const found = await sequelize.query(
        'SELECT id FROM roles WHERE company_id=? AND name=?',
        { replacements: [companyId, r.name], type: QueryTypes.SELECT }
      );
      if (!found.length) {
        await sequelize.query(
          "INSERT INTO roles (company_id, name, name_ar, permissions, is_system, created_at, updated_at) VALUES (?,?,?,?,1,datetime('now'),datetime('now'))",
          { replacements: [companyId, r.name, r.nameAr, r.perm] }
        );
        console.log('[init] Role created:', r.name);
      }
    }

    // Admin user
    const [adminRole] = await sequelize.query(
      "SELECT id FROM roles WHERE company_id=? AND name='ADMIN'",
      { replacements: [companyId], type: QueryTypes.SELECT }
    );
    if (!adminRole) throw new Error('ADMIN role missing');

    const [existingU] = await sequelize.query(
      'SELECT id FROM users WHERE company_id=? AND email=?',
      { replacements: [companyId, EMAIL], type: QueryTypes.SELECT }
    );

    if (!existingU) {
      const hash = await bcrypt.hash(PASSWORD, 12);
      await sequelize.query(
        "INSERT INTO users (company_id, role_id, email, password_hash, is_active, created_at, updated_at) VALUES (?,?,?,?,1,datetime('now'),datetime('now'))",
        { replacements: [companyId, adminRole.id, EMAIL, hash] }
      );
      console.log('[init] Admin user created:', EMAIL);
    }

    console.log('\n=== Login Credentials ===');
    console.log('Email   :', EMAIL);
    console.log('Password:', PASSWORD);
    console.log('=========================\n');

    try { await sequelize.close(); } catch { /* ignore */ }
    process.exit(0);
  } catch (err) {
    console.error('[init] Failed:', err.message);
    process.exit(1);
  }
}

run();
