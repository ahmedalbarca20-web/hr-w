require('dotenv').config();
const { sequelize } = require('./src/config/db');
const { QueryTypes } = require('sequelize');

(async () => {
  const from = new Date().toISOString().slice(0, 10);
  const to = from;
  const companyId = 1;
  const rows = await sequelize.query(`
    SELECT 
      e.id, 
      e.first_name, 
      e.last_name, 
      a.status 
    FROM employees e 
    LEFT JOIN attendance a 
      ON a.employee_id = e.id 
      AND a.work_date BETWEEN :from AND :to 
    WHERE e.company_id = :companyId 
      AND e.status = 'ACTIVE'
  `, { 
    replacements: { companyId, from, to }, 
    type: QueryTypes.SELECT 
  });
  console.log('Report Rows for Test:', rows.filter(r => r.first_name === 'Test'));
  process.exit(0);
})();
