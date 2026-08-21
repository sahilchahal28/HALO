import mongoose from 'mongoose';

const BedSchema = new mongoose.Schema({
  bedId: { type: String, required: true, unique: true }, // e.g. ICU-01
  wardId: { type: String, required: true },
  bedNumber: { type: String, required: true },
  status: { type: String, enum: ['AVAILABLE', 'OCCUPIED', 'CLEANING', 'UNAVAILABLE'], default: 'AVAILABLE' },
  patientId: { type: String },
  patientName: { type: String },
  episodeId: { type: String },
  treatmentEpisodeId: { type: String }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

BedSchema.virtual('department').get(function() {
  if (this.wardId === 'WARD-ICU') return 'ICU';
  if (this.wardId === 'WARD-CCU') return 'CCU';
  if (this.wardId === 'WARD-GEN') return 'General Ward';
  if (this.wardId === 'WARD-PVT') return 'Private Ward';
  return 'General Ward';
});

export default mongoose.model('Bed', BedSchema);
