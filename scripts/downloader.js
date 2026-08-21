import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, execSync } from 'child_process';
import QRCode from 'qrcode';
import http from 'http';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, '../dist');

console.log('📦 Compiling optimized production bundle for mobile PWA...');
try {
  execSync('npm run build', { stdio: 'inherit' });
  console.log('✅ Bundle ready.');
} catch (err) {
  console.warn('⚠️ Build warning, proceeding with current dist files.');
}

const app = express();
app.use(cors());

// Proxy API requests to MongoDB backend on port 5001
app.use('/api', (req, res) => {
  const options = {
    hostname: 'localhost',
    port: 5001,
    path: `/api${req.url}`,
    method: req.method,
    headers: {
      ...req.headers,
      host: 'localhost:5001'
    }
  };
  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });
  proxyReq.on('error', () => {
    res.status(502).json({ error: 'Backend on port 5001 not reachable. Ensure npm run host is running.' });
  });
  req.pipe(proxyReq, { end: true });
});

// Explicit route for downloader.html
app.get('/downloader.html', (req, res) => {
  res.sendFile(path.join(distPath, 'downloader.html'));
});

// Route to serve sw.js directly, bypassing browser caches so updates propagate instantly
app.get('/sw.js', (req, res) => {
  const swPath = path.join(distPath, 'sw.js');
  if (!fs.existsSync(swPath)) {
    return res.status(404).send('Service worker not found');
  }
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.sendFile(swPath);
});

// Serve compiled static assets (Single JS bundle + CSS + Manifests + Icons + Service Worker)
app.use(express.static(distPath, { maxAge: 0 }));

// Catch-all SPA router (Express 5 compatible)
app.use((req, res, next) => {
  if (path.extname(req.path)) {
    return next();
  }

  const htmlPath = path.join(distPath, 'index.html');
  if (!fs.existsSync(htmlPath)) {
    return res.status(404).send('Not Found');
  }

  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  res.sendFile(htmlPath);
});

// Watch for changes in src/ and public/ to automatically compile and update in real-time
function startWatcher() {
  console.log('👀 Watching src/ and public/ for real-time changes...');
  
  let rebuildTimeout = null;
  const dirsToWatch = [
    path.resolve(__dirname, '../src'),
    path.resolve(__dirname, '../public')
  ];

  function triggerRebuild() {
    console.log('🔄 Change detected! Rebuilding production bundle...');
    try {
      execSync('npm run build', { stdio: 'inherit' });
      console.log('✅ Rebuild complete. PWA will auto-update on next refresh/check.');
    } catch (e) {
      console.error('❌ Rebuild failed:', e.message);
    }
  }

  dirsToWatch.forEach(dir => {
    if (!fs.existsSync(dir)) return;
    fs.watch(dir, { recursive: true }, (eventType, filename) => {
      // Ignore temporary/hidden/IDE files
      if (filename && (filename.startsWith('.') || filename.endsWith('~') || filename.includes('node_modules') || filename.includes('.git'))) {
        return;
      }
      
      // Debounce rebuilds to allow multiple files saving to settle
      clearTimeout(rebuildTimeout);
      rebuildTimeout = setTimeout(triggerRebuild, 800);
    });
  });
}

const PWA_PORT = 5179;
let serverInstance = null;

try {
  serverInstance = app.listen(PWA_PORT, '0.0.0.0', () => {
    console.log(`🚀 Standalone PWA server running on port ${PWA_PORT} (all interfaces)`);
    startWatcher();
  });
} catch (e) {
  console.log(`PWA server already active on port ${PWA_PORT}`);
}

console.log('⚡ Starting permanent HTTPS tunnel via localhost.run...');

function startTunnel() {
  const ssh = spawn('ssh', [
    '-o', 'ServerAliveInterval=10',
    '-o', 'ServerAliveCountMax=6',
    '-o', 'TCPKeepAlive=yes',
    '-o', 'StrictHostKeyChecking=no',
    '-R', `80:localhost:${PWA_PORT}`,
    'nokey@localhost.run'
  ]);

  let urlDetected = false;

  ssh.stdout.on('data', async (data) => {
    const output = data.toString();
    const urlMatch = output.match(/https:\/\/[a-zA-Z0-9-.]+/);
    
    if (urlMatch && !urlDetected) {
      urlDetected = true;
      const rawUrl = urlMatch[0];
      const downloaderUrl = `${rawUrl}/downloader.html`;
      
      try {
        const qrDarkTheme = await QRCode.toString(downloaderUrl, { type: 'terminal', small: true, inverse: false });
        const qrLightTheme = await QRCode.toString(downloaderUrl, { type: 'terminal', small: true, inverse: true });
        
        console.clear();
        console.log('\n========================================================================');
        console.log('             HALO HIGH-SPEED NATIVE PWA DOWNLOADER (HTTPS)              ');
        console.log('========================================================================\n');
        
        console.log('📱 SCAN THIS (FOR DARK TERMINAL / BLACK BACKGROUND):');
        console.log(qrDarkTheme);
        
        console.log('📱 SCAN THIS (FOR LIGHT TERMINAL / WHITE BACKGROUND):');
        console.log(qrLightTheme);
        
        console.log('🔗 DIRECT HTTPS PORTAL LINK:');
        console.log(`   ➔ \x1b[32m\x1b[1m${downloaderUrl}\x1b[0m\n`);
        
        console.log('========================================================================');
        console.log('📲 HOW TO INSTALL BOTH SEPARATE APPS:');
        console.log('   1. Scan the QR code above or open the link on your phone.');
        console.log('   2. Tap "Doctor Portal" -> Tap "Install" banner to install Doctor App.');
        console.log('   3. Go back -> Tap "Patient Portal" -> Tap "Install" banner to install Patient App.');
        console.log('   4. Both apps will appear as separate native icons on your home screen!');
        console.log('========================================================================');
        console.log('Press Ctrl+C to close the secure tunnel.');
        console.log('========================================================================\n');
      } catch (err) {
        console.error('QR Render Error:', err);
      }
    }
  });

  ssh.stderr.on('data', (data) => {
    const output = data.toString();
    if (output.includes('Are you sure you want to continue connecting')) {
      process.stdout.write(output);
    }
  });

  ssh.on('close', (code) => {
    console.log(`\n🔄 Tunnel reconnecting in 2s (code ${code})...`);
    setTimeout(startTunnel, 2000);
  });

  process.stdin.pipe(ssh.stdin);
}

startTunnel();
