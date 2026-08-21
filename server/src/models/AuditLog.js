import mongoose from 'mongoose';

const AuditLogSchema = new mongoose.Schema({
  actor: { type: String, required: true }, // will map to currentUser details
  action: { type: String, required: true }, // e.g. Patient registered
  entityType: { type: String, required: true }, // e.g. Patient, Bed
  entityId: { type: String, required: true },
  metadata: { type: mongoose.Schema.Types.Mixed },
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model('AuditLog', AuditLogSchema);
