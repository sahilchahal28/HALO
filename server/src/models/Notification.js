import mongoose from 'mongoose';

const NotificationSchema = new mongoose.Schema({
  notificationId: { type: String, required: true, unique: true },
  recipientType: { type: String, enum: ['DOCTOR', 'PATIENT', 'ADMIN'], required: true },
  recipientId: { type: String, required: true },
  type: { type: String, enum: ['AMBULANCE', 'CRITICAL', 'ICU_ADMIT', 'LAB_RESULT', 'SURGERY_SCHEDULED', 'PATIENT_MESSAGE', 'BED_ASSIGNED', 'BLOOD_ALERT', 'LOW_STOCK'], required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  relatedEntity: { type: String }, // e.g. TreatmentEpisode, AmbulanceRequest
  relatedEntityId: { type: String },
  status: { type: String, enum: ['UNREAD', 'READ', 'ARCHIVED'], default: 'UNREAD' },
  readAt: { type: Date },
  archivedAt: { type: Date }
}, { timestamps: true });

export default mongoose.model('Notification', NotificationSchema);
