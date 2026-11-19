/**
 * server/scripts/vault-control.js
 *
 * Unified CLI Control for HALO Mac Device Storage Vault
 *
 * Commands:
 *   node server/scripts/vault-control.js start   (or: npm run vault:start / npm run storage:on)
 *   node server/scripts/vault-control.js stop    (or: npm run vault:stop  / npm run storage:off)
 *   node server/scripts/vault-control.js status  (or: npm run vault:status / npm run storage:status)
 *   node server/scripts/vault-control.js sync    (pings Railway & local server to re-announce status)
 */

import os from 'os';
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

dotenv.config({ path: path.join(ROOT_DIR, '.env') });

const PORT = parseInt(process.env.PORT || '5001', 10);
const RAILWAY_URL = 'https://halo-production-8760181f.up.railway.app';
const STATE_FILE = path.resolve(ROOT_DIR, 'server/storage/.vault-state.json');

function writeVaultState(enabled) {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify({
      enabled: Boolean(enabled),
      updatedAt: new Date().toISOString(),
    }, null, 2));
  } catch (_) {}
}

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

function sendPost(urlStr, data) {
  return new Promise((resolve) => {
    try {
      const url = new URL(urlStr);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;
      const payload = JSON.stringify(data);

      const req = client.request(
        urlStr,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
          timeout: 4000,
        },
        (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body }));
        }
      );

      req.on('error', (err) => resolve({ ok: false, error: err.message }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Timed out' }); });
      req.write(payload);
      req.end();
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
}

function checkPortOpen(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1200, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function getRunningTunnelPids() {
  const pids = [];
  try {
    const out = execSync('pgrep -f "server/scripts/tunnel.js"', { encoding: 'utf8' }).trim();
    if (out) {
      out.split('\n').forEach((p) => {
        const n = parseInt(p.trim(), 10);
        if (n && n !== process.pid) pids.push(n);
      });
    }
  } catch (_) {}
  return pids;
}

function getCloudflaredPids() {
  const pids = [];
  try {
    const out = execSync('pgrep -f "cloudflared tunnel"', { encoding: 'utf8' }).trim();
    if (out) {
      out.split('\n').forEach((p) => {
        const n = parseInt(p.trim(), 10);
        if (n && n !== process.pid) pids.push(n);
      });
    }
  } catch (_) {}
  return pids;
}

async function updateMongoVaultNode(status, tunnelUrl = '') {
  try {
    const { connectDB } = await import('../src/config/db.js');
    await connectDB();
    const VaultNode = (await import('../src/models/VaultNode.js')).default;
    const lanIp = getLanIp();

    await VaultNode.findOneAndUpdate(
      { nodeId: 'mac-primary' },
      {
        $set: {
          status,
          ...(tunnelUrl ? { tunnelUrl } : { tunnelUrl: null }),
          localUrl: `http://127.0.0.1:${PORT}`,
          lanUrl: `http://${lanIp}:${PORT}`,
          storageProvider: 'Mac Disk Space (server/storage/users/records)',
          lastHeartbeat: new Date(),
        },
      },
      { upsert: true }
    );
    return true;
  } catch (err) {
    console.warn('[MongoDB Warning] Direct update failed:', err.message);
    return false;
  }
}

// ─── COMMAND: STOP ───────────────────────────────────────────────────────────
async function cmdStop() {
  console.log('================================================================');
  console.log('  HALO MAC STORAGE VAULT — SHUTTING DOWN');
  console.log('================================================================');

  // 1. Terminate running tunnel processes
  const tunnelPids = getRunningTunnelPids();
  const cfPids = getCloudflaredPids();

  if (tunnelPids.length > 0) {
    console.log(`• Stopping ${tunnelPids.length} active tunnel process(es)... (PIDs: ${tunnelPids.join(', ')})`);
    for (const pid of tunnelPids) {
      try { process.kill(pid, 'SIGINT'); } catch (_) {}
    }
  }

  if (cfPids.length > 0) {
    console.log(`• Cleaning up ${cfPids.length} background cloudflared tunnel daemon(s)...`);
    for (const pid of cfPids) {
      try { process.kill(pid, 'SIGKILL'); } catch (_) {}
    }
  }

  // 2. Notify local server
  console.log('• Notifying local server: OFFLINE...');
  await sendPost(`http://127.0.0.1:${PORT}/api/vault/heartbeat`, {
    status: 'OFFLINE',
    tunnelUrl: '',
    storageProvider: 'Mac Disk Space (Offline)',
  });

  // 3. Notify Railway production cloud backend
  console.log('• Notifying Railway production backend: OFFLINE...');
  const railwayRes = await sendPost(`${RAILWAY_URL}/api/vault/heartbeat`, {
    status: 'OFFLINE',
    tunnelUrl: '',
    storageProvider: 'Mac Disk Space (Offline)',
  });
  if (railwayRes.ok) {
    console.log('  ✓ Railway cloud backend updated: status is OFFLINE.');
  } else {
    console.log(`  • Railway note: ${railwayRes.error || 'Backend resting'}`);
  }

  // 4. Update MongoDB Atlas directly
  console.log('• Updating MongoDB Atlas registry: OFFLINE...');
  await updateMongoVaultNode('OFFLINE', '');

  // 5. Persist offline flag locally
  writeVaultState(false);

  console.log('================================================================');
  console.log('  STATUS: OFFLINE — MAC STORAGE VAULT SAFELY STOPPED');
  console.log('================================================================');
  console.log('  • Mac Disk Space is marked OFFLINE.');
  console.log('  • Railway will NOT redirect traffic to stale tunnels.');
  console.log('  • If Railway is shut down or restarting, state is cleanly preserved.');
  console.log('  • To turn it back on anytime:');
  console.log('      npm run vault:start   (or: npm run storage:on)\n');
  process.exit(0);
}

// ─── COMMAND: START ──────────────────────────────────────────────────────────
async function cmdStart() {
  const tunnelPids = getRunningTunnelPids();
  if (tunnelPids.length > 0) {
    console.log(`[Mac Storage Vault] Tunnel is already running (PID: ${tunnelPids.join(', ')}).`);
    console.log('To restart cleanly, run "npm run vault:stop" first, then "npm run vault:start".');
    await cmdStatus();
    process.exit(0);
  }

  writeVaultState(true);

  console.log('================================================================');
  console.log('  HALO MAC STORAGE VAULT — STARTING');
  console.log('================================================================');
  console.log('• Launching tunnel runner to connect Mac disk storage...');
  
  // Forward to server/scripts/tunnel.js
  const tunnelScript = path.join(ROOT_DIR, 'server/scripts/tunnel.js');
  const child = spawn('node', [tunnelScript], {
    stdio: 'inherit',
    cwd: ROOT_DIR,
    env: { ...process.env, ENABLE_OBJECT_STORAGE_WORKER: 'true' },
  });

  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}

// ─── COMMAND: SYNC ───────────────────────────────────────────────────────────
async function cmdSync() {
  console.log('================================================================');
  console.log('  HALO MAC STORAGE VAULT — SYNCHRONIZING STATE');
  console.log('================================================================');
  
  const isServerUp = await checkPortOpen(PORT);
  console.log(`• Local Server (Port ${PORT}): ${isServerUp ? 'ONLINE' : 'OFFLINE'}`);

  let localStatus = null;
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/vault/status`);
    if (res.ok) localStatus = await res.json();
  } catch (_) {}

  const tunnelUrl = localStatus?.tunnelUrl || '';
  const status = isServerUp && (localStatus?.online !== false) ? 'ONLINE' : 'OFFLINE';

  console.log(`• Updating MongoDB Atlas: ${status}...`);
  await updateMongoVaultNode(status, tunnelUrl);

  console.log(`• Pinging Railway Cloud Backend (${RAILWAY_URL})...`);
  const rRes = await sendPost(`${RAILWAY_URL}/api/vault/heartbeat`, {
    status,
    tunnelUrl,
    localUrl: `http://127.0.0.1:${PORT}`,
    lanUrl: `http://${getLanIp()}:${PORT}`,
    storageProvider: 'Mac Disk Space (server/storage/users/records)',
  });

  if (rRes.ok) {
    console.log('  ✓ Railway synchronized successfully and acknowledged online status!');
  } else {
    console.log(`  • Railway note: ${rRes.error || 'Railway backend offline / sleeping'}`);
    console.log('    (Safe: MongoDB Atlas was updated directly. The moment you spin Railway');
    console.log('    back up, it will read this updated state without needing another sync.)');
  }

  console.log('================================================================\n');
  process.exit(0);
}

// ─── COMMAND: STATUS ─────────────────────────────────────────────────────────
async function cmdStatus() {
  console.log('================================================================');
  console.log('  HALO MAC STORAGE VAULT — STATUS OVERVIEW');
  console.log('================================================================');

  const lanIp = getLanIp();
  const isServerUp = await checkPortOpen(PORT);
  const tunnelPids = getRunningTunnelPids();
  const cfPids = getCloudflaredPids();

  console.log(`  • Local Server (Port ${PORT}):  ${isServerUp ? '🟢 ONLINE' : '🔴 OFFLINE'}`);
  console.log(`  • Tunnel Process:           ${tunnelPids.length > 0 ? `🟢 RUNNING (PID ${tunnelPids.join(', ')})` : '⚪ STOPPED'}`);
  console.log(`  • Cloudflare Daemons:       ${cfPids.length > 0 ? `🟢 ACTIVE (${cfPids.length})` : '⚪ NONE'}`);
  console.log(`  • Mac Local IP:             http://${lanIp}:${PORT}`);

  // Query MongoDB Atlas
  try {
    const { connectDB } = await import('../src/config/db.js');
    await connectDB();
    const VaultNode = (await import('../src/models/VaultNode.js')).default;
    const node = await VaultNode.findOne({ nodeId: 'mac-primary' }).lean();

    if (node) {
      const ageMs = Date.now() - new Date(node.lastHeartbeat).getTime();
      const ageSec = Math.round(ageMs / 1000);
      const isHeartbeatFresh = ageMs < 45000;

      console.log(`\n  [Database Registry in MongoDB Atlas]`);
      console.log(`  • Status:                   ${node.status === 'ONLINE' ? '🟢 ONLINE' : '⚪ OFFLINE'}`);
      console.log(`  • Active Tunnel URL:        ${node.tunnelUrl || '(none)'}`);
      console.log(`  • Last Heartbeat:           ${node.lastHeartbeat ? `${ageSec}s ago ${isHeartbeatFresh ? '(fresh)' : '(stale)'}` : 'Never'}`);
      console.log(`  • Storage Provider:         ${node.storageProvider || 'Mac Disk Space'}`);
    } else {
      console.log('\n  [Database Registry]: No mac-primary record found in MongoDB.');
    }
  } catch (err) {
    console.log(`\n  [Database Error]: ${err.message}`);
  }

  // Query Railway
  try {
    const rRes = await fetch(`${RAILWAY_URL}/api/vault/status`, { signal: AbortSignal.timeout(3000) });
    if (rRes.ok) {
      const rData = await rRes.json();
      console.log(`\n  [Railway Cloud Backend]`);
      console.log(`  • Railway Sees Vault As:    ${rData.online ? '🟢 ONLINE' : '⚪ OFFLINE'}`);
      if (rData.tunnelUrl) console.log(`  • Tunnel Connected:         ${rData.tunnelUrl}`);
    } else {
      console.log(`\n  [Railway Cloud Backend]: Responded with status ${rRes.status}`);
    }
  } catch (_) {
    console.log(`\n  [Railway Cloud Backend]: Unreachable (Backend may be shut down or sleeping)`);
  }

  // Disk statistics
  try {
    if (fs.existsSync(STORAGE_ROOT)) {
      const patientDirs = fs.readdirSync(STORAGE_ROOT).filter((f) => !f.startsWith('.'));
      let fileCount = 0;
      let totalBytes = 0;
      for (const d of patientDirs) {
        const full = path.join(STORAGE_ROOT, d);
        if (fs.statSync(full).isDirectory()) {
          const files = fs.readdirSync(full).filter((f) => !f.startsWith('.'));
          fileCount += files.length;
          for (const f of files) {
            try { totalBytes += fs.statSync(path.join(full, f)).size; } catch (_) {}
          }
        }
      }
      console.log(`\n  [Mac Disk Records]`);
      console.log(`  • Storage Path:             ${STORAGE_ROOT}`);
      console.log(`  • Patients Stored:          ${patientDirs.length}`);
      console.log(`  • Files on Disk:            ${fileCount} files (${(totalBytes / 1024 / 1024).toFixed(2)} MB)`);
    }
  } catch (_) {}

  console.log('================================================================');
  console.log('  Commands:');
  console.log('  • Turn ON:   npm run vault:start  (or: npm run storage:on)');
  console.log('  • Turn OFF:  npm run vault:stop   (or: npm run storage:off)');
  console.log('  • Check:     npm run vault:status (or: npm run storage:status)');
  console.log('================================================================\n');
  process.exit(0);
}

// ─── CLI DISPATCHER ──────────────────────────────────────────────────────────
const arg = (process.argv[2] || '').toLowerCase().trim();

switch (arg) {
  case 'start':
  case 'on':
  case 'up':
    cmdStart();
    break;

  case 'stop':
  case 'off':
  case 'down':
    cmdStop();
    break;

  case 'sync':
  case 'heartbeat':
  case 'pulse':
    cmdSync();
    break;

  case 'status':
  case 'info':
  case 'check':
  default:
    cmdStatus();
    break;
}
