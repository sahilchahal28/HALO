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
import https from 'https';
import { spawn } from 'child_process';
import localtunnel from 'localtunnel';

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

// Probe the PUBLIC tunnel endpoint — catches "half-dead" tunnels that accept
// connections but can't proxy to the backend (surface as 408/503 to clients).
function checkTunnelHealth(publicUrl) {
  return new Promise((resolve) => {
    const req = https.get(`${publicUrl}/health`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(6000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function main() {
  const lanIp = getLanIp();
  const serverProc = await ensureServerRunning();

  let tunnel = await startTunnel(DEFAULT_SUBDOMAIN);
  const publicUrl = tunnel.url;

  // The Vercel frontend proxies /api to this Mac through the tunnel
  // (see the vercel.json rewrite), so phones must use the PLAIN portal URLs
  // below — no ?server= override. Appending ?server=<tunnel-url> forces all
  // API calls cross-origin to the tunnel, which breaks login the moment the
  // tunnel restarts (no CORS on error pages) and persists in localStorage.
  const doctorUrl = `${FRONTEND_HOST}/doctor`;
  const patientUrl = `${FRONTEND_HOST}/patient`;
  const adminUrl = `${FRONTEND_HOST}/admin`;

  console.log('\n================================================================');
  console.log('  STATUS: ONLINE — TUNNEL READY (VERCEL PATH)');
  console.log('================================================================');
  console.log(`  • Local Server (This Mac):  http://127.0.0.1:${PORT}`);
  console.log(`  • Local Wi-Fi (LAN IP):     http://${lanIp}:${PORT}`);
  console.log(`  • Public Tunnel Address:    ${publicUrl}`);
  console.log(`  • Mac Storage Directory:    server/storage/users/records/`);
  console.log('----------------------------------------------------------------');
  console.log(`  Direct (LAN): open http://${lanIp}:${PORT}/doctor | /patient | /admin`);
  console.log(`  Vercel path:  ${doctorUrl} | ${patientUrl} | ${adminUrl}`);
  console.log('                (PWA calls same-origin /api, rewritten to this Mac via vercel.json)');
  console.log('================================================================');
  console.log('  Keep this terminal window open. Press Ctrl+C to stop.\n');
  console.log('  NOTE: only if the Public Tunnel Address above differs from the');
  console.log('  address in vercel.json should you append ?server=<tunnel-url> to');
  console.log('  the Vercel links — otherwise login will fail.');

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

  // Self-healing watchdog: the tunnel can go half-dead (accepts connections
  // but can't proxy). Probe the public URL and restart the tunnel if it fails.
  let healthy = true;
  setInterval(async () => {
    try {
      const ok = await checkTunnelHealth(tunnel.url);
      if (!ok && healthy) {
        healthy = false;
        console.warn(`\n[Watchdog] Tunnel not responding (${tunnel.url}). Restarting...`);
        try { tunnel.close(); } catch (_) {}
        await new Promise((r) => setTimeout(r, 2500));
        tunnel = await startTunnel(DEFAULT_SUBDOMAIN);
        console.log(`[Watchdog] Tunnel restarted at: ${tunnel.url}`);
        console.warn('[Watchdog] If this address changed, update vercel.json and redeploy.');
      } else if (ok && !healthy) {
        healthy = true;
        console.log('[Watchdog] Tunnel health recovered.');
      }
    } catch (e) {
      console.error('[Watchdog] Health check error:', e.message);
    }
  }, 30000);

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
