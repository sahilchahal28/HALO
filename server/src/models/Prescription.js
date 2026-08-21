import mongoose from 'mongoose';

const MedicineSchema = new mongoose.Schema({
  name: { type: String, required: true },
  dosage: { type: String, required: true },
  frequency: { type: String, required: true },
  duration: { type: String, required: true },
  instructions: { type: String }
});

const PrescriptionSchema = new mongoose.Schema({
  prescriptionId: { type: String, required: true, unique: true },
  patientId: { type: String, required: true },
  treatmentEpisodeId: { type: String, required: true },
  doctorId: { type: String, required: true },
  medicines: [MedicineSchema],
  notes: { type: String },
  originalDocumentId: { type: String } // reference file ID key
}, { timestamps: true });

export default mongoose.model('Prescription', PrescriptionSchema);
