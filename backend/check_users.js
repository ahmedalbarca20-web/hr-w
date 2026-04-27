require('dotenv').config();
const { User, Role } = require('./src/models/index');

const { connectDB, sequelize } = require('./src/config/db');

async function check() {
    try {
        await connectDB();
        const users = await User.findAll({
            include: [{ model: Role, as: 'role' }]
        });
        console.log('Total users:', users.length);
        users.forEach(u => {
            console.log(`ID: ${u.id}, Email: ${u.email}, Role: ${u.role?.name}, CompanyID: ${u.company_id}, Active: ${u.is_active}`);
        });
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
