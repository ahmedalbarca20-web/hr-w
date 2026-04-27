require('dotenv').config();
const { Device } = require('./src/models/index');
const { connectDB } = require('./src/config/db');

async function check() {
    try {
        await connectDB();
        const devices = await Device.findAll();
        console.log('Devices found:', devices.length);
        devices.forEach(d => {
            console.log(`ID: ${d.id}, Name: ${d.name}, IP: ${d.ip_address}, Status: ${d.status}`);
        });
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
check();
