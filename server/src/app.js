import express from 'express';
import cors from 'cors';
import compression from 'compression';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { authenticate } from './middleware/authenticate.js';
import authRoutes from './routes/authRoutes.js';
import apiRouter from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, '../../dist');

const app = express();

// Disable x-powered-by header for performance and security
app.disable('x-powered-by');

// Enable GZIP compression for all responses (reduces bundle payloads by 70%+)
app.use(compression());

app.use(cors());
app.use(express.json());

// Mount auth routes (public — login/refresh/logout manage their own access)
app.use('/api/auth', authRoutes);

// Server info endpoint — returns LAN IP so tunnel-installed PWAs can find the backend
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

// All other API routes require a valid session token
app.use('/api', authenticate, apiRouter);

// Health check route
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Serve compiled static frontend with correct caching headers:
// - /sw.js            -> no-store (service worker must always revalidate)
// - *.html            -> no-cache  (entry point must pick up new hashed assets)
// - /assets/*         -> 1y immutable (content-hashed filenames)
// - everything else   -> default (etag revalidation)
app.use(express.static(distPath, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('sw.js')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    } else if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

// Fallback for Single Page Application routes (e.g. /doctor, /patient, etc.)
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path === '/health') {
    return next();
  }
  res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  res.sendFile(path.join(distPath, 'index.html'));
});

// Centralized Error Handling Middleware
app.use(errorHandler);

export default app;
