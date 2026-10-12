import mongoose from 'mongoose';

const DoctorSchema = new mongoose.Schema({
  doctorId: { type: String, required: true, unique: true }, // e.g. doctor1
  name: { type: String, required: true },
  phone: { type: String },
  department: { type: String },
  specialty: { type: String },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  pin: { type: String, default: null }, // Bcrypt hash of 6-digit PIN; null defaults to '123456'
  pinUpdatedAt: { type: Date }
}, { timestamps: true });

export default mongoose.model('Doctor', DoctorSchema);
