import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { autoSeedIfEmpty } from './autoSeed.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/halo';

export async function connectDB() {
  const options = {
    serverSelectionTimeoutMS: 4000,
    maxPoolSize: 50, // Connection pool for concurrent multi-device requests
    minPoolSize: 5
  };

  try {
    console.log('[Database] Connecting to MongoDB Atlas...');
    await mongoose.connect(MONGO_URI, options);
    console.log('[Database] Connected to MongoDB Atlas successfully.');
    await autoSeedIfEmpty();
  } catch (atlasErr) {
    console.warn('\n[Database Warning] Failed to connect to MongoDB Atlas (e.g. IP whitelist block or offline).');
    console.warn('Reason:', atlasErr.message);

    // Fallback: Local MongoDB
    const LOCAL_URI = 'mongodb://127.0.0.1:27017/halo';
    console.log('[Database] Attempting connection to Local MongoDB...');
    try {
      await mongoose.connect(LOCAL_URI, options);
      console.log('[Database] Connected to Local MongoDB successfully.');
      await autoSeedIfEmpty();
    } catch (localErr) {
      console.error('\n[Database Error] Failed to connect to Local MongoDB as well.');
      console.error('Reason:', localErr.message);
      console.warn('[Database System] Disabling query command buffering. All database requests will respond immediately rather than hanging.\n');
      
      // Disable command buffering so that queries fail fast instead of timing out
      mongoose.set('bufferCommands', false);
    }
  }
}
