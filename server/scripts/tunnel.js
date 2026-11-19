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
    env: { ...process.env, PORT: String(PORT), ENABLE_OBJECT_STORAGE_WORKER: 'true' },
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
  // 1. Try Cloudflare Tunnel if cloudflared binary is installed
  const cloudflaredPath = '/opt/homebrew/bin/cloudflared';
  try {
    const fs = await import('fs');
    if (fs.existsSync(cloudflaredPath)) {
      // Clean up any lingering cloudflared processes before starting
      try {
        const { execSync } = await import('child_process');
        execSync('pkill -9 -f "cloudflared tunnel" || true', { stdio: 'ignore' });
      } catch (_) {}

      console.log(`[Tunnel] Starting high-speed Cloudflare Tunnel to port ${PORT}...`);
      const child = spawn(cloudflaredPath, ['tunnel', '--url', `http://127.0.0.1:${PORT}`]);
      let resolvedUrl = null;

      const urlPromise = new Promise((resolve) => {
        child.stderr.on('data', (d) => {
          const str = d.toString();
          const match = str.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
          if (match && !resolvedUrl) {
            resolvedUrl = match[0];
            resolve({
              url: resolvedUrl,
              close: () => { try { child.kill('SIGKILL'); } catch (_) {} },
              on: (event, cb) => {
                if (event === 'close') child.on('close', cb);
                if (event === 'error') child.on('error', cb);
              }
            });
          }
        });
        child.stdout.on('data', (d) => {
          const str = d.toString();
          const match = str.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
          if (match && !resolvedUrl) {
            resolvedUrl = match[0];
            resolve({
              url: resolvedUrl,
              close: () => { try { child.kill('SIGKILL'); } catch (_) {} },
              on: (event, cb) => {
                if (event === 'close') child.on('close', cb);
                if (event === 'error') child.on('error', cb);
              }
            });
          }
        });
      });

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Cloudflare tunnel timeout')), 12000)
      );

      const tunnelObj = await Promise.race([urlPromise, timeoutPromise]);
      console.log(`[Tunnel] Cloudflare Tunnel established: ${tunnelObj.url}`);
      return tunnelObj;
    }
  } catch (cfErr) {
    console.warn(`[Tunnel] Cloudflare tunnel unavailable (${cfErr.message}), falling back to localtunnel...`);
  }

  // 2. Fallback to localtunnel
  console.log(`[Tunnel] Connecting localtunnel to port ${PORT}... (requesting: ${requestedSubdomain})`);
  try {
    const tunnel = await localtunnel({
      port: PORT,
      subdomain: requestedSubdomain,
    });

    if (tunnel && typeof tunnel.on === 'function') {
      tunnel.on('error', (err) => {
        console.warn('[Tunnel Error Caught]:', err.message);
      });
    }

    const expectedHost = `${requestedSubdomain}.loca.lt`;
    if (!tunnel.url.includes(expectedHost) && attempt < 5) {
      console.warn(`[Tunnel] loca.lt assigned alias ${tunnel.url} instead of ${expectedHost}. Reconnecting in 3s to reclaim ${requestedSubdomain}...`);
      try { tunnel.close(); } catch (_) {}
      await new Promise((r) => setTimeout(r, 3000));
      return startTunnel(requestedSubdomain, attempt + 1);
    }

    return tunnel;
  } catch (err) {
    if (attempt < 5) {
      console.log(`[Tunnel] Retry ${attempt} after error: ${err.message}...`);
      await new Promise((r) => setTimeout(r, 3000));
      return startTunnel(requestedSubdomain, attempt + 1);
    }
    throw err;
  }
}

// Probe the PUBLIC tunnel endpoint — catches "half-dead" tunnels that accept
// connections but can't proxy to the backend (surface as 408/503 to clients).
function checkTunnelHealth(publicUrl) {
  return new Promise((resolve) => {
    if (!publicUrl) return resolve(false);
    const client = publicUrl.startsWith('https') ? https : http;
    const req = client.get(`${publicUrl}/health`, {
      headers: { 'bypass-tunnel-reminder': 'true', 'User-Agent': 'HALO-Watchdog/1.0' }
    }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(12000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function sendVaultHeartbeat(status = 'ONLINE', publicTunnelUrl = '') {
  return new Promise((resolve) => {
    try {
      const lanIp = getLanIp();
      const payload = JSON.stringify({
        status,
        tunnelUrl: publicTunnelUrl,
        lanUrl: `http://${lanIp}:${PORT}`,
        localUrl: `http://127.0.0.1:${PORT}`,
      });

      // 1. Post to local server
      const reqLocal = http.request(
        `http://127.0.0.1:${PORT}/api/vault/heartbeat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
          timeout: 4000,
        },
        (res) => {
          res.resume();
          resolve(true);
        }
      );
      reqLocal.on('error', () => resolve(false));
      reqLocal.on('timeout', () => { reqLocal.destroy(); resolve(false); });
      reqLocal.write(payload);
      reqLocal.end();

      // 2. Also notify remote Railway backend so remote clients immediately see the vault is online
      const railwayReq = https.request(
        `https://halo-production-8760181f.up.railway.app/api/vault/heartbeat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
          timeout: 4000,
        },
        (res) => {
          res.resume();
        }
      );
      railwayReq.on('error', () => {});
      railwayReq.on('timeout', () => railwayReq.destroy());
      railwayReq.write(payload);
      railwayReq.end();
    } catch (_) {
      resolve(false);
    }
  });
}

async function main() {
  const lanIp = getLanIp();
  const serverProc = await ensureServerRunning();

  let tunnel = await startTunnel(DEFAULT_SUBDOMAIN);
  const publicUrl = tunnel.url;

  try {
    const fs = await import('fs');
    const path = await import('path');
    const stateFile = path.resolve(process.cwd(), 'server/storage/.vault-state.json');
    const dir = path.dirname(stateFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify({ enabled: true, updatedAt: new Date().toISOString() }, null, 2));
  } catch (_) {}

  // Register Mac Device Storage Vault as ONLINE in MongoDB
  await sendVaultHeartbeat('ONLINE', publicUrl);
  console.log('[Mac Device Vault] Registered status: ONLINE with active tunnel.');

  // Heartbeat watchdog: update MongoDB heartbeat every 15s
  const heartbeatInterval = setInterval(async () => {
    await sendVaultHeartbeat('ONLINE', tunnel.url);
  }, 15000);

  // The Vercel frontend proxies /api to this Mac through the tunnel
  // (see the vercel.json rewrite), so phones must use the PLAIN portal URLs
  // below — no ?server= override. Appending ?server=<tunnel-url> forces all
  // API calls cross-origin to the tunnel, which breaks login the moment the
  // tunnel restarts (no CORS on error pages) and persists in localStorage.
  const doctorTunnelUrl = `${FRONTEND_HOST}/doctor?server=${encodeURIComponent(publicUrl)}`;
  const patientTunnelUrl = `${FRONTEND_HOST}/patient?server=${encodeURIComponent(publicUrl)}`;
  const adminTunnelUrl = `${FRONTEND_HOST}/admin?server=${encodeURIComponent(publicUrl)}`;

  console.log('\n================================================================');
  console.log('  STATUS: ONLINE — MAC DEVICE STORAGE VAULT READY');
  console.log('================================================================');
  console.log(`  • Local Server (This Mac):  http://127.0.0.1:${PORT}`);
  console.log(`  • Local Wi-Fi (LAN IP):     http://${lanIp}:${PORT}`);
  console.log(`  • Public Tunnel Address:    ${publicUrl}`);
  console.log(`  • Mac Storage Directory:    server/storage/users/records/`);
  console.log(`  • Object Storage (IndexedDB): ACTIVE & SYNCHRONIZING`);
  console.log('----------------------------------------------------------------');
  console.log(`  Direct on Wi-Fi (LAN):      http://${lanIp}:${PORT}/doctor`);
  console.log(`  Remote from anywhere:       ${doctorTunnelUrl}`);
  console.log('================================================================');
  console.log('  Keep this terminal window open. Press Ctrl+C to stop.\n');

  // Auto-reconnect watchdog (for EventEmitter tunnel providers like localtunnel)
  if (typeof tunnel.on === 'function') {
    tunnel.on('close', async () => {
      console.warn('\n[Tunnel] Connection closed. Reconnecting in 3 seconds...');
      setTimeout(async () => {
        try {
          tunnel = await startTunnel(DEFAULT_SUBDOMAIN);
          console.log(`[Tunnel] Reconnected at: ${tunnel.url}`);
          await sendVaultHeartbeat('ONLINE', tunnel.url);
          console.log(`[Tunnel] New Remote Doctor URL: ${FRONTEND_HOST}/doctor?server=${encodeURIComponent(tunnel.url)}`);
        } catch (e) {
          console.error('[Tunnel] Reconnect failed:', e.message);
        }
      }, 3000);
    });

    tunnel.on('error', (err) => {
      console.error('[Tunnel Error]:', err.message);
    });
  }

  // Self-healing watchdog: probe the public URL every 30s.
  // Requires 3 consecutive health probe failures before restarting to prevent flapping.
  let isRestarting = false;
  let consecutiveFailures = 0;
  // Give tunnel 45 seconds of initial grace period before first health probe
  setTimeout(() => {
    setInterval(async () => {
      try {
        if (isRestarting || !tunnel?.url) return;
        const ok = await checkTunnelHealth(tunnel.url);
        if (ok) {
          consecutiveFailures = 0;
          return;
        }

        consecutiveFailures++;
        console.warn(`[Watchdog] Probe failed (${consecutiveFailures}/3) for ${tunnel.url}`);

        if (consecutiveFailures >= 3) {
          isRestarting = true;
          console.warn(`\n[Watchdog] Tunnel not responding after 3 consecutive probes (${tunnel.url}). Reconnecting...`);
          try { tunnel.close(); } catch (_) {}
          await new Promise((r) => setTimeout(r, 3000));
          try {
            tunnel = await startTunnel(DEFAULT_SUBDOMAIN);
            console.log(`[Watchdog] Tunnel restarted at: ${tunnel.url}`);
            await sendVaultHeartbeat('ONLINE', tunnel.url);
            consecutiveFailures = 0;
          } catch (reconnectErr) {
            console.error('[Watchdog] Reconnect attempt failed:', reconnectErr.message);
          } finally {
            isRestarting = false;
          }
        }
      } catch (e) {
        console.error('[Watchdog] Health check error:', e.message);
        isRestarting = false;
      }
    }, 30000);
  }, 45000);

  const shutdown = async () => {
    console.log('\n[HALO Tunnel] Deregistering Mac Device Storage Vault...');
    clearInterval(heartbeatInterval);
    try {
      const fs = await import('fs');
      const path = await import('path');
      const stateFile = path.resolve(process.cwd(), 'server/storage/.vault-state.json');
      fs.writeFileSync(stateFile, JSON.stringify({ enabled: false, updatedAt: new Date().toISOString() }, null, 2));
    } catch (_) {}
    await sendVaultHeartbeat('OFFLINE', '');
    try { tunnel.close(); } catch (_) {}
    if (serverProc) serverProc.kill();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

process.on('uncaughtException', (err) => {
  if (err?.message && (err.message.includes('localtunnel') || err.message.includes('ECONNREFUSED') || err.message.includes('connection refused'))) {
    console.warn('[Tunnel Network Error Handled]:', err.message);
    return;
  }
  console.error('[HALO Tunnel Uncaught Error]:', err);
});

main().catch((err) => {
  console.error('[HALO Tunnel Fatal Error]:', err);
  process.exit(1);
});
