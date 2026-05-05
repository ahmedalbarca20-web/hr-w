'use strict';

require('dotenv').config();
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../src/config/db');

async function run() {
  try {
    await sequelize.authenticate();
    const rows = await sequelize.query(
      `SELECT u.id, u.email AS user_email, c.email AS company_email
       FROM users u
       JOIN companies c ON c.id = u.company_id
       WHERE lower(u.email) = lower(c.email)
       ORDER BY u.id`,
      { type: QueryTypes.SELECT },
    );

    if (!rows.length) {
      // eslint-disable-next-line no-console
      console.log('No overlaps found.');
      await sequelize.close();
      return;
    }

    for (const r of rows) {
      const newEmail = `user${r.id}+${String(r.user_email).toLowerCase()}`;
      // eslint-disable-next-line no-console
      console.log(`Updating user ${r.id}: ${r.user_email} -> ${newEmail}`);
      await sequelize.query(
        'UPDATE users SET email = :newEmail WHERE id = :id',
        { replacements: { id: r.id, newEmail } },
      );
    }

    const after = await sequelize.query(
      `SELECT COUNT(*)::int AS cnt
       FROM users u
       JOIN companies c ON c.id = u.company_id
       WHERE lower(u.email) = lower(c.email)`,
      { type: QueryTypes.SELECT },
    );
    // eslint-disable-next-line no-console
    console.log(`Remaining overlaps: ${after[0]?.cnt ?? 0}`);
    await sequelize.close();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error:', err.message);
    process.exit(1);
  }
}

run();
