require('dotenv').config();
const zkteco = require('./src/services/zktecoSocket.service');

(async () => {
  console.log('Testing connection to 192.168.0.238...');
  try {
    const result = await zkteco.probeSnapshot({ ip: '192.168.0.238', port: 4370 });
    console.log('Snapshot result:', JSON.stringify(result, null, 2));

    if (result.ok) {
      console.log('Connection successful. Pulling attendances...');
      const atts = await zkteco.fetchAttendanceLogs({ ip: '192.168.0.238', port: 4370, max_records: 100 });
      console.log(`Pulled ${atts.records ? atts.records.length : 0} attendances`);
      if (atts.records && atts.records.length > 0) {
        console.log('Sample attendance:', atts.records[0]);
      }
    } else {
      console.log('Failed to connect or snapshot result not OK.');
    }
  } catch(err) {
    console.error('Error:', err);
  }
  process.exit(0);
})();
