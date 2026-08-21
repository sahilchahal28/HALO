import mongoose from 'mongoose';

const BloodDonorSchema = new mongoose.Schema({
  donorId: { type: String, required: true, unique: true }, // e.g. DONOR-10001
  name: { type: String, required: true },
  bloodGroup: { type: String, required: true, enum: ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'] },
  phone: { type: String, required: true },
  location: { type: String },
  lastDonationDate: { type: Date },
  eligibilityStatus: { type: String, enum: ['ELIGIBLE', 'INELIGIBLE'], default: 'ELIGIBLE' },
  emergencyContactConsent: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model('BloodDonor', BloodDonorSchema);
