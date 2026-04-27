require('dotenv').config();
const { User } = require('./src/models/index');
const { connectDB } = require('./src/config/db');

async function activate() {
    try {
        await connectDB();
        const [affectedCount] = await User.update(
            { is_active: 1 },
            { where: { email: 'admin@hr.com' } }
        );
        console.log(`Updated ${affectedCount} user(s).`);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

activate();
