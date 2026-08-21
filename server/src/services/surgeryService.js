import Surgery from '../models/Surgery.js';
import Patient from '../models/Patient.js';
import Doctor from '../models/Doctor.js';
import TreatmentEpisode from '../models/TreatmentEpisode.js';
import ScheduleEvent from '../models/ScheduleEvent.js';
import Notification from '../models/Notification.js';
import { logAction } from './auditService.js';

export async function getSurgeries() {
  return await Surgery.find({});
}

export async function bookSurgery({ patientId, procedure, doctorId, operatingTheatre, time }, actor) {
  const patient = await Patient.findOne({ patientId });
  if (!patient) throw new Error('Patient not found');
  const doctor = await Doctor.findOne({ doctorId });
  if (!doctor) throw new Error('Doctor not found');

  const activeEpisode = await TreatmentEpisode.findOne({ patientId, status: 'ACTIVE' });
  const treatmentEpisodeId = activeEpisode ? activeEpisode.episodeId : 'EP-GLOBAL';

  const count = await Surgery.countDocuments();
  const surgeryId = `SURG-${10000 + count}`;

  const parsedDate = new Date(time);
  if (isNaN(parsedDate)) throw new Error('Invalid date/time format for surgery schedule');

  const surgery = new Surgery({
    surgeryId,
    patientId,
    patientName: patient.fullName,
    treatmentEpisodeId,
    doctorId,
    doctorName: doctor.name,
    operatingTheatre,
    procedure,
    scheduledAt: parsedDate,
    status: 'SCHEDULED'
  });

  await surgery.save();

  // Insert event into doctor clinical schedule feed
  const eventId = `EV-${10000 + count}`;
  const endTime = new Date(parsedDate.getTime() + 2 * 60 * 60 * 1000); // Default 2 hours duration
  await ScheduleEvent.create({
    eventId,
    doctorId,
    patientId,
    treatmentEpisodeId,
    type: 'SURGERY',
    title: `OT Surgery: ${procedure}`,
    startTime: parsedDate,
    endTime,
    location: operatingTheatre,
    notes: `Procedure for ${patient.fullName}. Operating Room: ${operatingTheatre}`
  });

  // Notify Doctor of scheduled surgery
  const notifId = `NOT-${Math.floor(100000 + Math.random() * 900000)}`;
  await Notification.create({
    notificationId: notifId,
    recipientType: 'DOCTOR',
    recipientId: doctorId,
    type: 'SURGERY_SCHEDULED',
    title: 'Surgery Booked',
    message: `You have been scheduled for: ${procedure} with patient ${patient.fullName} at ${time}. Room: ${operatingTheatre}.`,
    relatedEntity: 'Surgery',
    relatedEntityId: surgeryId,
    patientId
  });

  // Update Episode Stages Timeline & Add billing charge
  if (activeEpisode) {
    activeEpisode.surgeries.push({
      procedure,
      time,
      theatre: operatingTheatre,
      status: 'Scheduled'
    });
    activeEpisode.currentStage = 'SURGERY';
    activeEpisode.billing.push({
      description: `OT Scheduled Surgery: ${procedure} in ${operatingTheatre}`,
      category: 'Surgery',
      quantity: 1,
      unitPrice: 15000,
      total: 15000,
      department: 'Surgery',
      status: 'PENDING'
    });
    await activeEpisode.save();
  }

  await logAction({
    actor: actor || 'admin',
    action: 'Surgery scheduled',
    entityType: 'Surgery',
    entityId: surgeryId,
    metadata: { procedure, operatingTheatre, time }
  });

  return surgery;
}
