import mongoose from 'mongoose';

const MedicalDocumentSchema = new mongoose.Schema({
  documentId: { type: String, required: true, unique: true },
  patientId: { type: String, required: true },
  treatmentEpisodeId: { type: String },
  type: { type: String, enum: ['PRESCRIPTION', 'LAB_REPORT', 'IMAGING', 'DISCHARGE_SUMMARY', 'REFERRAL', 'OTHER'], required: true },
  title: { type: String, required: true },
  fileRef: { type: String, required: true }, // reference to S3, GCS or local disk
  uploadedBy: { type: String, required: true }
}, { timestamps: true });

export default mongoose.model('MedicalDocument', MedicalDocumentSchema);
