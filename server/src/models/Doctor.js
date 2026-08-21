import mongoose from 'mongoose';

const DoctorSchema = new mongoose.Schema({
  doctorId: { type: String, required: true, unique: true }, // e.g. doctor1
  name: { type: String, required: true },
  phone: { type: String },
  department: { type: String },
  specialty: { type: String },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' }
}, { timestamps: true });

export default mongoose.model('Doctor', DoctorSchema);
