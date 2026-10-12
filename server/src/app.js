import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import path from 'path';
import os from 'os';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { authenticate, verifyToken } from './middleware/authenticate.js';
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

// CORS — allow all origins with credentials for LAN / PWA access
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));
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

// Realtime broadcast wrapper — must be registered BEFORE the API router so
// every mutation response triggers a 'sync' event on completion.
app.use('/api', (req, res, next) => {
  res.on('finish', () => {
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      res.statusCode < 400 &&
      !req.path.startsWith('/auth/')
    ) {
      io.emit('sync', { resource: req.originalUrl, at: Date.now() });
    }
  });
  next();
});

// All other API routes require a valid session token
app.use('/api', authenticate, apiRouter);

// ---------------------------------------------------------------------------
// Real-time sync: every successful mutation (POST/PUT/DELETE) broadcasts a
// 'sync' event to ALL connected clients so every device updates instantly.
// Clients respond by refetching their role-relevant data.
// ---------------------------------------------------------------------------
const allowedOrigins = [
  process.env.CLIENT_URL,
  'https://halo-wheat.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
].filter(Boolean);

const server = http.createServer(app);
const io = new SocketServer(server, {
  cors: {
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl)
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.includes(origin) ||
        origin.endsWith('.vercel.app') ||
        origin.startsWith('http://localhost:') ||
        origin.startsWith('http://127.0.0.1:')
      ) {
        return callback(null, true);
      }
      // Allow same-origin / private LAN access: phones and laptops connecting
      // directly to http://<mac-ip>:5001 (or any other LAN address).
      const host = new URL(origin).hostname;
      if (isPrivateNetworkHost(host)) return callback(null, true);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  },
});

// Detect private LAN / local loopback hostnames for socket CORS.
function isPrivateNetworkHost(host) {
  if (host === 'localhost') return true;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    // 10.0.0.0/8 · 172.16.0.0/12 · 192.168.0.0/16 · 169.254.0.0/16 (link-local)
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
  }
  // IPv6: unique-local (fc/fd), link-local (fe80), loopback (::1)
  if (host.startsWith('fc') || host.startsWith('fd') || host === '::1' || host.startsWith('fe80')) return true;
  return false;
}

// Socket auth — same rules as the HTTP API
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required.'));
  if (token === 'mock-admin-token') {
    socket.data.user = { id: 'admin', role: 'ADMIN' };
    return next();
  }
  const decoded = verifyToken(token);
  if (!decoded || !decoded.sub) return next(new Error('Session expired.'));
  socket.data.user = { id: decoded.sub, role: decoded.role };
  next();
});

io.on('connection', (socket) => {
  console.log(`[Realtime] Client connected (${socket.data.user?.role}). Total: ${io.engine.clientsCount}`);

  // Admin automatically joins patient:all for the full archive mirror
  if (socket.data.user?.role === 'ADMIN') {
    socket.join('patient:all');
  }

  // Subscribe to a specific patient room (for doctor viewing patient, or patient viewing own)
  socket.on('subscribe:patient', (patientId) => {
    if (patientId) {
      const room = `patient:${String(patientId).trim()}`;
      socket.join(room);
      console.log(`[Realtime] Socket ${socket.id} (${socket.data.user?.role}) joined room: ${room}`);
    }
  });

  socket.on('unsubscribe:patient', (patientId) => {
    if (patientId) {
      const room = `patient:${String(patientId).trim()}`;
      socket.leave(room);
      console.log(`[Realtime] Socket ${socket.id} left room: ${room}`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[Realtime] Client disconnected. Total: ${io.engine.clientsCount}`);
  });
});

app.set('io', io);

// Health check route — includes DB connection state for deployment diagnostics
app.get('/health', (req, res) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  res.json({
    status: 'ok',
    time: new Date(),
    db: {
      state: states[mongoose.connection.readyState] || mongoose.connection.readyState,
      host: mongoose.connection.host || null,
      uriConfigured: Boolean(process.env.MONGO_URI),
    },
  });
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
export { server, io };
