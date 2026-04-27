require('dotenv').config();
const { Device } = require('./src/models/index');
const { connectDB } = require('./src/config/db');
const deviceService = require('./src/services/device.service');

(async () => {
  await connectDB();
  const d = await Device.findOne({ where: { ip_address: '192.168.0.238' } });
  if (d) {
    console.log(`Device found: ID ${d.id}`);
    
    // Import users
    console.log('Importing users...');
    try {
      const importUsersResult = await deviceService.importZkUsersToEmployees(d.id, d.company_id, { uids: [], port: 4370 });
      console.log('Import Users Result:', importUsersResult);
    } catch (err) {
      console.error('Error importing users:', err);
    }

    // Import attendances
    console.log('Importing attendances...');
    try {
      const importAttResult = await deviceService.importZkAttendancesToDeviceLogs(d.id, d.company_id, {
        port: 4370,
        max_records: 100,
        auto_process: true
      });
      console.log('Import Attendances Result:', importAttResult);
    } catch (err) {
      console.error('Error importing attendances:', err);
    }
  } else {
    console.log('Device not found. Trying to find by serial number 2803850 or company_id=1 to update IP...');
    const anyDevice = await Device.findOne({ where: { company_id: 1 } });
    if (anyDevice) {
        console.log(`Found a device with ID ${anyDevice.id}, updating IP to 192.168.0.238...`);
        await anyDevice.update({ ip_address: '192.168.0.238', serial_number: '2803850' });
        console.log('IP updated. Please run this script again.');
    } else {
        console.log('No devices found in DB to attach to.');
    }
  }
  process.exit(0);
})();
