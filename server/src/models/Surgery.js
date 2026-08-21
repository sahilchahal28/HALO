import mongoose from 'mongoose';

const SurgerySchema = new mongoose.Schema({
  surgeryId: { type: String, required: true, unique: true }, // e.g. SURG-10001
  patientId: { type: String, required: true },
  treatmentEpisodeId: { type: String, required: true },
  doctorId: { type: String, required: true },
  operatingTheatre: { type: String, required: true }, // e.g. OT-01
  procedure: { type: String, required: true },
  scheduledAt: { type: Date, required: true },
  status: { type: String, enum: ['SCHEDULED', 'PREPARING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'], default: 'SCHEDULED' }
}, { timestamps: true });

export default mongoose.model('Surgery', SurgerySchema);
