import dotenv from 'dotenv';
dotenv.config();

import app, { server } from './app.js';
import { connectDB } from './config/db.js';

import { startRetentionWorker } from './services/retentionWorker.js';
import os from 'os';

const PORT = process.env.PORT || 5001;

function getLanIp() {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    for (const info of iface) {
      if (info.family === 'IPv4' && !info.internal) {
        return info.address;
      }
    }
  }
  return 'localhost';
}

// Connect to the database BEFORE accepting traffic so no request ever hits
// a half-initialized Mongoose connection (critical for cold starts on hosts
// like Railway where Atlas is reached over the public internet).
try {
  await connectDB();
  // Start the background data retention auto-deletion worker (runs every 24h)
  startRetentionWorker();
} catch (err) {
  console.error('[HALO Server] Database connection failed:', err.message);
  process.exit(1);
}

server.listen(PORT, '0.0.0.0', () => {
  const lanIp = getLanIp();
  console.log(`[HALO Server] Listening on port ${PORT} (all interfaces)...`);
  console.log('================================================================');
  console.log('  HALO DEVICE STORAGE SERVER — ONLINE');
  console.log('  Mac = centralized object storage & API');
  console.log('================================================================');
  console.log(`  • This Mac:        http://127.0.0.1:${PORT}`);
  console.log(`  • Wi-Fi (LAN IP):  http://${lanIp}:${PORT}`);
  console.log(`  • Doctor PWA:      http://${lanIp}:${PORT}/doctor`);
  console.log(`  • Patient PWA:     http://${lanIp}:${PORT}/patient`);
  console.log(`  • Admin Web:       http://${lanIp}:${PORT}/admin`);
  console.log(`  • Storage:         server/storage/users/records/<patientId>/`);
  console.log('================================================================');
  console.log('  Open the role URL above on any phone on this Wi-Fi network.');
  console.log('  Keep this terminal window open. Press Ctrl+C to stop.\n');
});
