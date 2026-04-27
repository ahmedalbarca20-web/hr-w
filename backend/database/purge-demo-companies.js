/**
 * Remove companies with demo tax_id (DEMO-NISR, DEMO-WATAN). CASCADE deletes related rows.
 *
 *   node database/purge-demo-companies.js
 */

'use strict';

require('dotenv').config();
const { sequelize } = require('../src/config/db');

const TAX_IDS = ['DEMO-NISR', 'DEMO-WATAN'];

async function run() {
  try {
    await sequelize.authenticate();
    const dialect = sequelize.getDialect();
    await sequelize.query(`DELETE FROM companies WHERE tax_id IN (?, ?)`, { replacements: TAX_IDS });
    console.log(`OK (${dialect}): deleted companies with tax_id in`, TAX_IDS.join(', '));
    await sequelize.close();
    process.exit(0);
  } catch (e) {
    console.error(e.message || e);
    process.exit(1);
  }
}

run();
