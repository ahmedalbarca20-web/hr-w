'use strict';

const { Client } = require('pg');
const bcrypt = require('bcryptjs');

async function run() {
  const email = process.env.SUPER_ADMIN_EMAIL || 'ahmedalbarca20@gmail.com';
  const password = process.env.SUPER_ADMIN_PASSWORD || 'Super@1234';

  const client = new Client({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE || 'postgres',
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  await client.query('BEGIN');

  let companyId;
  const companyRow = await client.query('select id from companies order by id asc limit 1');
  if (companyRow.rows.length) {
    companyId = companyRow.rows[0].id;
  } else {
    const ins = await client.query(
      'insert into companies (name,name_ar,currency,timezone,is_active,created_at,updated_at) values ($1,$2,$3,$4,$5,now(),now()) returning id',
      ['', '', 'IQD', 'Asia/Baghdad', 1],
    );
    companyId = ins.rows[0].id;
  }

  let roleId;
  const roleRow = await client.query(
    'select id from roles where company_id = $1 and name = $2 order by id asc limit 1',
    [companyId, 'SUPER_ADMIN'],
  );
  if (roleRow.rows.length) {
    roleId = roleRow.rows[0].id;
  } else {
    const insRole = await client.query(
      'insert into roles (company_id,name,name_ar,permissions,is_system,created_at,updated_at) values ($1,$2,$3,$4,$5,now(),now()) returning id',
      [companyId, 'SUPER_ADMIN', 'الأدمن الرئيسي', '["*"]', 1],
    );
    roleId = insRole.rows[0].id;
  }

  const userRow = await client.query(
    'select id from users where lower(email)=lower($1) order by id asc limit 1',
    [email],
  );
  if (userRow.rows.length) {
    await client.query(
      'update users set role_id=$1,is_active=1,company_id=null,employee_id=null,refresh_token=null,updated_at=now() where id=$2',
      [roleId, userRow.rows[0].id],
    );
    console.log('SUPER_ADMIN_UPDATED', userRow.rows[0].id);
  } else {
    const hash = await bcrypt.hash(password, 12);
    const insUser = await client.query(
      'insert into users (company_id,employee_id,role_id,email,password_hash,is_active,created_at,updated_at) values (null,null,$1,$2,$3,1,now(),now()) returning id',
      [roleId, email, hash],
    );
    console.log('SUPER_ADMIN_CREATED', insUser.rows[0].id);
  }

  await client.query('COMMIT');
  await client.end();

  console.log('SUPER_ADMIN_EMAIL', email);
  console.log('SUPER_ADMIN_PASSWORD', password);
}

run().catch(async (e) => {
  // eslint-disable-next-line no-console
  console.error('SUPER_ADMIN_FAILED', e.message);
  process.exit(1);
});
