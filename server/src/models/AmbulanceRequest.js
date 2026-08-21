import mongoose from 'mongoose';

const AmbulanceRequestSchema = new mongoose.Schema({
  requestId: { type: String, required: true, unique: true }, // e.g. AMB-10001
  patientId: { type: String, required: true },
  treatmentEpisodeId: { type: String },
  condition: { type: String, required: true },
  location: { type: String, required: true },
  contact: { type: String, required: true },
  assignedDoctorId: { type: String },
  assignedAmbulanceId: { type: String },
  driverName: { type: String },
  driverPhone: { type: String },
  plateNumber: { type: String },
  status: { type: String, enum: ['REQUESTED', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'COMPLETED', 'CANCELLED'], default: 'REQUESTED' },
  requestedAt: { type: Date, default: Date.now },
  assignedAt: { type: Date },
  arrivedAt: { type: Date },
  completedAt: { type: Date }
}, { timestamps: true });

export default mongoose.model('AmbulanceRequest', AmbulanceRequestSchema);
