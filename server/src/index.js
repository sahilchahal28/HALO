import dotenv from 'dotenv';
dotenv.config();

import app, { server } from './app.js';
import { connectDB } from './config/db.js';

import { startRetentionWorker } from './services/retentionWorker.js';

const PORT = process.env.PORT || 5001;

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
  console.log(`[HALO Server] Listening on port ${PORT} (all interfaces)...`);
});
