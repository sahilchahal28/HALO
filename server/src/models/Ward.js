import mongoose from 'mongoose';

const WardSchema = new mongoose.Schema({
  wardId: { type: String, required: true, unique: true }, // e.g. WARD-ICU
  name: { type: String, required: true },
  type: { type: String, enum: ['ICU', 'CCU', 'GENERAL', 'PRIVATE', 'EMERGENCY'], required: true }
}, { timestamps: true });

export default mongoose.model('Ward', WardSchema);
