import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, execSync } from 'child_process';
import QRCode from 'qrcode';
import http from 'http';
import os from 'os';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, '../dist');

function injectAssetsIntoServiceWorker() {
  console.log('🔄 Injecting production assets into Service Worker cache list...');
  
  const filesToCache = [];
  
  function walkDir(currentPath) {
    const files = fs.readdirSync(currentPath);
    for (const file of files) {
      const fullPath = path.join(currentPath, file);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        walkDir(fullPath);
      } else {
        // Get relative path from distPath
        const relativePath = '/' + path.relative(distPath, fullPath).replace(/\\/g, '/');
        
        // Exclude sw.js itself, downloader-qr.png, and map files if any
        if (
          relativePath !== '/sw.js' &&
          relativePath !== '/downloader-qr.png' &&
          !relativePath.endsWith('.map')
        ) {
          filesToCache.push(relativePath);
        }
      }
    }
  }
  
  try {
    walkDir(distPath);
    
    // Manually append PWA routing entry points so they are directly cached and offline-ready
    if (!filesToCache.includes('/doctor')) {
      filesToCache.push('/doctor');
    }
    if (!filesToCache.includes('/patient')) {
      filesToCache.push('/patient');
    }
    
    // Make sure root '/' is included
    if (!filesToCache.includes('/')) {
      filesToCache.unshift('/');
    }
    
    const swPath = path.join(distPath, 'sw.js');
    if (fs.existsSync(swPath)) {
      let swContent = fs.readFileSync(swPath, 'utf8');
      
      // Replace STATIC_ASSETS array
      const assetsJson = JSON.stringify(filesToCache, null, 2);
      const regex = /const\s+STATIC_ASSETS\s*=\s*\[[\s\S]*?\];/;
      
      if (regex.test(swContent)) {
        swContent = swContent.replace(regex, `const STATIC_ASSETS = ${assetsJson};`);
        fs.writeFileSync(swPath, swContent, 'utf8');
        console.log(`✅ Successfully injected ${filesToCache.length} assets into dist/sw.js`);
      } else {
        console.warn('⚠️ Could not find STATIC_ASSETS placeholder in sw.js');
      }
    } else {
      console.error('❌ dist/sw.js not found!');
    }
  } catch (err) {
    console.error('❌ Error injecting assets into Service Worker:', err);
  }
}

console.log('📦 Compiling optimized production bundle for mobile PWA...');
try {
  execSync('npm run build', { stdio: 'inherit' });
  console.log('✅ Bundle ready.');
  injectAssetsIntoServiceWorker();
} catch (err) {
  console.warn('⚠️ Build warning, proceeding with current dist files.');
}

const app = express();
app.use(cors());

// Endpoint to discover the server's LAN IP (used by downloader.html to save for PWAs)
app.get('/api/server-info', (req, res) => {
  const interfaces = os.networkInterfaces();
  let lanIp = null;
  for (const iface of Object.values(interfaces)) {
    for (const info of iface) {
      if (info.family === 'IPv4' && !info.internal) {
        lanIp = info.address;
        break;
      }
    }
    if (lanIp) break;
  }
  res.json({ lanIp: lanIp || req.hostname });
});

// Endpoint to return the latest compiled assets for dynamic over-the-air updates
app.get('/api/latest-assets', (req, res) => {
  const filesToCache = [];
  
  function walkDir(currentPath) {
    if (!fs.existsSync(currentPath)) return;
    const files = fs.readdirSync(currentPath);
    for (const file of files) {
      const fullPath = path.join(currentPath, file);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        walkDir(fullPath);
      } else {
        const relativePath = '/' + path.relative(distPath, fullPath).replace(/\\/g, '/');
        if (
          relativePath !== '/sw.js' &&
          relativePath !== '/downloader-qr.png' &&
          !relativePath.endsWith('.map')
        ) {
          filesToCache.push(relativePath);
        }
      }
    }
  }
  
  try {
    walkDir(distPath);
    if (!filesToCache.includes('/')) {
      filesToCache.unshift('/');
    }
    res.json({ assets: filesToCache });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read assets: ' + err.message });
  }
});

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

// Route to serve sw.js dynamically with fresh assets pre-cache list and bypass browser caches
app.get('/sw.js', (req, res) => {
  const swPath = path.join(distPath, 'sw.js');
  if (!fs.existsSync(swPath)) {
    return res.status(404).send('Service worker template not found');
  }

  const filesToCache = [];
  
  function walkDir(currentPath) {
    if (!fs.existsSync(currentPath)) return;
    const files = fs.readdirSync(currentPath);
    for (const file of files) {
      const fullPath = path.join(currentPath, file);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        walkDir(fullPath);
      } else {
        const relativePath = '/' + path.relative(distPath, fullPath).replace(/\\/g, '/');
        // Exclude sw.js itself, downloader-qr.png, and map files if any
        if (
          relativePath !== '/sw.js' &&
          relativePath !== '/downloader-qr.png' &&
          !relativePath.endsWith('.map')
        ) {
          filesToCache.push(relativePath);
        }
      }
    }
  }

  try {
    walkDir(distPath);
    
    // Manually append PWA routing entry points so they are directly cached and offline-ready
    if (!filesToCache.includes('/doctor')) {
      filesToCache.push('/doctor');
    }
    if (!filesToCache.includes('/patient')) {
      filesToCache.push('/patient');
    }
    
    if (!filesToCache.includes('/')) {
      filesToCache.unshift('/');
    }

    let swContent = fs.readFileSync(swPath, 'utf8');
    const assetsJson = JSON.stringify(filesToCache, null, 2);
    const regex = /const\s+STATIC_ASSETS\s*=\s*\[[\s\S]*?\];/;
    
    if (regex.test(swContent)) {
      swContent = swContent.replace(regex, `const STATIC_ASSETS = ${assetsJson};`);
    }

    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.send(swContent);
  } catch (err) {
    res.status(500).send('Error generating service worker: ' + err.message);
  }
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

  try {
    let html = fs.readFileSync(htmlPath, 'utf8');

    // Determine manifest path based on the requested URL route
    let manifestHref = '/manifest.json';
    if (req.path.startsWith('/doctor')) {
      manifestHref = '/manifest-doctor.json';
    } else if (req.path.startsWith('/patient')) {
      manifestHref = '/manifest-patient.json';
    }

    // Statically inject the manifest link tag in the head
    // This allows Chrome WebAPK creation service to scan and verify the manifest without executing JavaScript.
    const manifestTag = `<link rel="manifest" href="${manifestHref}">`;
    html = html.replace('<head>', `<head>\n    ${manifestTag}`);

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    res.status(500).send('Error reading index.html: ' + err.message);
  }
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
