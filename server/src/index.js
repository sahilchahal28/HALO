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
  if (process.env.ENABLE_OBJECT_STORAGE_WORKER !== 'false') {
    startRetentionWorker();
  } else {
    console.log('[Retention Worker] Object storage background worker disabled.');
  }

  // Register Mac Device Storage Vault as ONLINE in MongoDB if running locally and not explicitly stopped
  if (!process.env.RAILWAY_ENVIRONMENT && !process.env.RAILWAY_STATIC_URL) {
    try {
      const VaultNode = (await import('./models/VaultNode.js')).default;
      const fs = await import('fs');
      const stateFilePath = path.join(process.cwd(), 'server/storage/.vault-state.json');
      let isVaultExplicitlyDisabled = false;
      try {
        if (fs.existsSync(stateFilePath)) {
          const rawState = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
          if (rawState.enabled === false) isVaultExplicitlyDisabled = true;
        }
      } catch (_) {}

      const existingNode = await VaultNode.findOne({ nodeId: 'mac-primary' }).lean();
      if (!isVaultExplicitlyDisabled && (!existingNode || existingNode.status !== 'OFFLINE')) {
        const lanIp = getLanIp();
        await VaultNode.findOneAndUpdate(
          { nodeId: 'mac-primary' },
          {
            $set: {
              status: 'ONLINE',
              storageProvider: 'Mac Disk Space (server/storage/users/records)',
              localUrl: `http://127.0.0.1:${PORT}`,
              lanUrl: `http://${lanIp}:${PORT}`,
              lastHeartbeat: new Date(),
            }
          },
          { upsert: true }
        );
        console.log('[Mac Storage Vault] Registered status: ONLINE in database.');
      } else {
        console.log('[Mac Storage Vault] Device storage is currently in STOPPED (OFFLINE) mode.');
      }

      // Maintain active heartbeat every 15s ONLY while vault remains ONLINE
      setInterval(async () => {
        try {
          const currentNode = await VaultNode.findOne({ nodeId: 'mac-primary' }).lean();
          if (currentNode && currentNode.status === 'ONLINE') {
            await VaultNode.updateOne(
              { nodeId: 'mac-primary' },
              { $set: { lastHeartbeat: new Date() } }
            );
          }
        } catch (_) {}
      }, 15000);
    } catch (vaultErr) {
      console.warn('[Mac Storage Vault] Initialization note:', vaultErr.message);
    }
  }
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
