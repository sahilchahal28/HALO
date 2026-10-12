import mongoose from 'mongoose';

const SurgerySchema = new mongoose.Schema({
  surgeryId: { type: String, required: true, unique: true }, // e.g. SURG-10001
  patientId: { type: String, required: true },
  patientName: { type: String },
  treatmentEpisodeId: { type: String, default: 'EP-GLOBAL' },
  doctorId: { type: String, required: true },
  doctorName: { type: String },
  doctorSpecialty: { type: String },
  operatingTheatre: { type: String, required: true }, // e.g. OT-01
  procedure: { type: String, required: true },
  scheduledAt: { type: Date, required: true },
  time: { type: String },
  status: { 
    type: String, 
    enum: ['SCHEDULED', 'PREPARING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'], 
    default: 'SCHEDULED' 
  },
  // Full operative completion records
  completedAt: { type: Date },
  durationMinutes: { type: Number },
  outcome: { type: String, default: 'Successful' }, // Successful, Uneventful, Minor Complications, Transferred to ICU
  notes: { type: String }, // Operative findings & post-op instructions
  performedBy: {
    doctorId: String,
    doctorName: String,
    specialty: String
  },
  // Cancellation details
  cancelledAt: { type: Date },
  cancellationReason: { type: String },
  cancelledBy: { type: String }
}, { timestamps: true });

export default mongoose.model('Surgery', SurgerySchema);
