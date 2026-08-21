import mongoose from 'mongoose';

const ScheduleEventSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true },
  doctorId: { type: String, required: true },
  patientId: { type: String },
  treatmentEpisodeId: { type: String },
  type: { type: String, enum: ['CHECKUP', 'FOLLOW_UP', 'SURGERY', 'WARD_ROUND', 'ICU_ROUND', 'INVESTIGATION_REVIEW', 'PRE_OP', 'POST_OP', 'AMBULANCE_ARRIVAL'], required: true },
  title: { type: String, required: true },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  location: { type: String },
  status: { type: String, enum: ['SCHEDULED', 'COMPLETED', 'CANCELLED'], default: 'SCHEDULED' },
  notes: { type: String }
}, { timestamps: true });

export default mongoose.model('ScheduleEvent', ScheduleEventSchema);
