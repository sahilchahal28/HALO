import mongoose from 'mongoose';

const vaultNodeSchema = new mongoose.Schema(
  {
    nodeId: { type: String, default: 'mac-primary', unique: true },
    status: { type: String, enum: ['ONLINE', 'OFFLINE'], default: 'OFFLINE' },
    tunnelUrl: { type: String, default: '' },
    lanUrl: { type: String, default: '' },
    localUrl: { type: String, default: 'http://127.0.0.1:5001' },
    storageProvider: { type: String, default: 'Mac Disk Space (server/storage/users/records)' },
    lastHeartbeat: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.models.VaultNode || mongoose.model('VaultNode', vaultNodeSchema);

