import mongoose from 'mongoose';

const BloodRequirementSchema = new mongoose.Schema({
  requirementId: { type: String, required: true, unique: true },
  patientId: { type: String, required: true },
  treatmentEpisodeId: { type: String, required: true },
  bloodGroup: { type: String, required: true, enum: ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'] },
  unitsRequired: { type: Number, required: true },
  unitsAvailable: { type: Number, default: 0 },
  shortage: { type: Number, required: true },
  status: { type: String, enum: ['PENDING', 'RESOLVED', 'CANCELLED'], default: 'PENDING' }
}, { timestamps: true });

export default mongoose.model('BloodRequirement', BloodRequirementSchema);
