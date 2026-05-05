'use strict';

require('dotenv').config();
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../src/config/db');

async function run() {
  try {
    await sequelize.authenticate();
    const rows = await sequelize.query(
      `SELECT
         u.id AS user_id,
         u.email AS user_email,
         u.company_id AS user_company_id,
         c.id AS company_id,
         c.name AS company_name,
         c.email AS company_email
       FROM users u
       JOIN companies c ON lower(u.email) = lower(c.email)
       ORDER BY c.id, u.id`,
      { type: QueryTypes.SELECT },
    );
    // eslint-disable-next-line no-console
    console.log(`matches=${rows.length}`);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(rows, null, 2));
    await sequelize.close();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error:', err.message);
    process.exit(1);
  }
}

run();
