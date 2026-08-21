import mongoose from 'mongoose';

const AmbulanceSchema = new mongoose.Schema({
  ambulanceId: { type: String, required: true, unique: true }, // e.g. AMB-001
  plateNumber: { type: String, required: true }, // e.g. MH-12-AB-1234
  driverName: { type: String, required: true },
  driverPhone: { type: String, required: true },
  status: { type: String, enum: ['AVAILABLE', 'DISPATCHED', 'MAINTENANCE'], default: 'AVAILABLE' }
}, { timestamps: true });

export default mongoose.model('Ambulance', AmbulanceSchema);
