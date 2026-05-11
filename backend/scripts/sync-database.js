'use strict';

/**
 * Applies idempotent schema patches from connectDB() against the configured DB
 * (MySQL/MariaDB or Postgres e.g. Supabase). Safe to run after deploy or when
 * pulling code — does not drop tables.
 *
 * Usage (from repo root or backend/):
 *   node backend/scripts/sync-database.js
 *
 * Requires backend/.env with DATABASE_URL or DB_* / same vars as server startup.
 * If ../../.env.local exists (repo root), it is loaded with override (common for Supabase URL).
 */

const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
// Repo-root overrides (e.g. DATABASE_URL for Supabase) — same pattern some setups use for deploy secrets.
const rootLocal = path.join(__dirname, '..', '..', '.env.local');
if (fs.existsSync(rootLocal)) {
  require('dotenv').config({ path: rootLocal, override: true });
}

const dbUrl = String(process.env.DATABASE_URL || '').trim();
if (/^postgres(ql)?:\/\//i.test(dbUrl)) {
  process.env.DB_DIALECT = 'postgres';
}

const { connectDB, sequelize } = require('../src/config/db');

async function main() {
  await connectDB();
  console.log('[sync-database] OK — ensure steps finished.');
  await sequelize.close();
}

main().catch((e) => {
  console.error('[sync-database] FAILED:', e?.message || e);
  process.exit(1);
});
