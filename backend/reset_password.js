require('dotenv').config();
const bcrypt = require('bcryptjs');
const { User } = require('./src/models/index');
const { connectDB } = require('./src/config/db');

async function reset() {
    try {
        await connectDB();
        const hash = await bcrypt.hash('Admin@1234', 12);
        const [affectedCount] = await User.update(
            { password_hash: hash, is_active: 1 },
            { where: { email: 'admin@hr.com' } }
        );
        console.log(`Updated ${affectedCount} user(s). Password reset to Admin@1234 and activated.`);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

reset();
