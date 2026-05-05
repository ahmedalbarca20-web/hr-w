'use strict';

require('dotenv').config();
const { sequelize } = require('../src/config/db');
const { QueryTypes } = require('sequelize');

async function run() {
  try {
    await sequelize.authenticate();
    const companies = await sequelize.query(
      'SELECT id FROM companies ORDER BY id ASC LIMIT 1',
      { type: QueryTypes.SELECT },
    );
    if (!companies.length) {
      throw new Error('No companies found in DB. Create a company first.');
    }
    const companyId = companies[0].id;

    const roles = await sequelize.query(
      "SELECT id FROM roles WHERE name = 'SUPER_ADMIN' ORDER BY id ASC LIMIT 1",
      { type: QueryTypes.SELECT },
    );

    if (roles.length) {
      // eslint-disable-next-line no-console
      console.log(`SUPER_ADMIN role already exists id=${roles[0].id}`);
    } else {
      await sequelize.query(
        `INSERT INTO roles (company_id, name, name_ar, permissions, is_system, created_at, updated_at)
         VALUES (:companyId, 'SUPER_ADMIN', 'Super Admin', '["*"]', 1, NOW(), NOW())`,
        { replacements: { companyId } },
      );
      // eslint-disable-next-line no-console
      console.log(`Created SUPER_ADMIN role on company_id=${companyId}`);
    }
    await sequelize.close();
    process.exit(0);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error:', err.message);
    process.exit(1);
  }
}

run();
