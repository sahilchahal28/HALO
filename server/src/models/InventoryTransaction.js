import mongoose from 'mongoose';

const InventoryTransactionSchema = new mongoose.Schema({
  transactionId: { type: String, required: true, unique: true }, // e.g. TXN-10001
  itemId: { type: String, required: true },
  type: { type: String, enum: ['RECEIVE', 'ISSUE', 'RETURN', 'WASTE', 'ADJUST'], required: true },
  quantity: { type: Number, required: true },
  batch: { type: String },
  patientId: { type: String },
  treatmentEpisodeId: { type: String },
  performedBy: { type: String, required: true },
  reason: { type: String },
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model('InventoryTransaction', InventoryTransactionSchema);
