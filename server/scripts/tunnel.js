/**
 * server/scripts/tunnel.js
 *
 * HALO Device-as-Server Tunnel Runner
 *
 * Runs the backend server on this Mac and establishes a secure public HTTPS tunnel
 * with a constant predefined address. Mobile PWAs (Doctor, Patient, Admin) can
 * connect from anywhere on Wi-Fi or cellular, and all medical records are stored
 * directly on this Mac under:
 *   server/storage/users/records/
 */
import os from 'os';
import http from 'http';
import { spawn } from 'child_process';
import localtunnel from 'localtunnel';
import QRCode from 'qrcode';

const PORT = parseInt(process.env.PORT || '5001', 10);
const DEFAULT_SUBDOMAIN = process.env.TUNNEL_SUBDOMAIN || 'halo-device-vault-mac';
const FRONTEND_HOST = process.env.CLIENT_URL || 'https://halo-wheat.vercel.app';

// Detect Mac LAN IP
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

// Check if server is running on PORT
function checkServerRunning(port) {
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

// Ensure server is up
async function ensureServerRunning() {
  const running = await checkServerRunning(PORT);
  if (running) {
    console.log(`[HALO Server] Detected backend already running on port ${PORT}.`);
    return null;
  }

  console.log(`[HALO Server] Starting local backend server on port ${PORT}...`);
  const child = spawn('node', ['server/src/index.js'], {
    stdio: 'inherit',
    env: { ...process.env, PORT: String(PORT) },
  });

  // Wait for server to become healthy
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 600));
    if (await checkServerRunning(PORT)) {
      console.log(`[HALO Server] Backend ready on port ${PORT}!`);
      return child;
    }
  }
  return child;
}

// Generate ASCII QR code in terminal
function renderQr(text) {
  return new Promise((resolve) => {
    QRCode.toString(text, { type: 'terminal', small: true }, (err, string) => {
      resolve(err ? '' : string);
    });
  });
}

async function startTunnel(requestedSubdomain, attempt = 1) {
  console.log(`[Tunnel] Connecting tunnel to port ${PORT}... (requesting: ${requestedSubdomain})`);
  try {
    const tunnel = await localtunnel({
      port: PORT,
      subdomain: requestedSubdomain,
    });

    return tunnel;
  } catch (err) {
    if (attempt < 3) {
      console.log(`[Tunnel] Retry ${attempt} with fallback identifier...`);
      return startTunnel(`${requestedSubdomain}-${Date.now().toString().slice(-4)}`, attempt + 1);
    }
    throw err;
  }
}

async function main() {
  console.log('\n================================================================');
  console.log('   HALO - DEVICE STORAGE SYSTEM & TUNNEL');
  console.log('================================================================\n');

  const lanIp = getLanIp();
  const serverProc = await ensureServerRunning();

  let tunnel = await startTunnel(DEFAULT_SUBDOMAIN);
  const publicUrl = tunnel.url;

  const doctorUrl = `${FRONTEND_HOST}/doctor?server=${encodeURIComponent(publicUrl)}`;
  const patientUrl = `${FRONTEND_HOST}/patient?server=${encodeURIComponent(publicUrl)}`;
  const adminUrl = `${FRONTEND_HOST}/admin?server=${encodeURIComponent(publicUrl)}`;

  const doctorQr = await renderQr(doctorUrl);

  console.log('\n================================================================');
  console.log('  STATUS: ONLINE & READY TO RECEIVE UPLOADS');
  console.log('================================================================');
  console.log(` • Local Server (This Mac):  http://127.0.0.1:${PORT}`);
  console.log(` • Local Wi-Fi (LAN IP):     http://${lanIp}:${PORT}`);
  console.log(` • Public Constant Address:  ${publicUrl}`);
  console.log(` • Mac Storage Directory:    server/storage/users/records/`);
  console.log('----------------------------------------------------------------');
  console.log('  SCAN WITH PHONE CAMERA TO CONNECT DOCTOR PWA INSTANTLY:');
  console.log(doctorQr);
  console.log('----------------------------------------------------------------');
  console.log('  DIRECT PWA LINKS:');
  console.log(`  👨‍⚕️ Doctor PWA:  ${doctorUrl}`);
  console.log(`  🧑‍💼 Patient PWA: ${patientUrl}`);
  console.log(`  🏢 Admin Web:   ${adminUrl}`);
  console.log('================================================================');
  console.log(' Keep this terminal window open. Press Ctrl+C to stop.\n');

  // Auto-reconnect watchdog
  tunnel.on('close', async () => {
    console.warn('\n[Tunnel] Connection closed. Reconnecting in 3 seconds...');
    setTimeout(async () => {
      try {
        tunnel = await startTunnel(DEFAULT_SUBDOMAIN);
        console.log(`[Tunnel] Reconnected at: ${tunnel.url}`);
      } catch (e) {
        console.error('[Tunnel] Reconnect failed:', e.message);
      }
    }, 3000);
  });

  tunnel.on('error', (err) => {
    console.error('[Tunnel Error]:', err.message);
  });

  process.on('SIGINT', () => {
    console.log('\n[HALO Tunnel] Shutting down...');
    tunnel.close();
    if (serverProc) serverProc.kill();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[HALO Tunnel Fatal Error]:', err);
  process.exit(1);
});
