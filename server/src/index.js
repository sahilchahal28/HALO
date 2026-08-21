import dotenv from 'dotenv';
dotenv.config();

import app from './app.js';
import { connectDB } from './config/db.js';

const PORT = process.env.PORT || 5001;

// Initialize Database Connection
connectDB();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[HALO Server] Listening on port ${PORT} (all interfaces)...`);
});
