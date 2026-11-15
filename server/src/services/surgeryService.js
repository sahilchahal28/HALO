import Surgery from '../models/Surgery.js';
import Patient from '../models/Patient.js';
import Doctor from '../models/Doctor.js';
import TreatmentEpisode from '../models/TreatmentEpisode.js';
import ScheduleEvent from '../models/ScheduleEvent.js';
import Notification from '../models/Notification.js';
import { logAction } from './auditService.js';

export async function getSurgeries() {
  const list = await Surgery.find({}).sort({ createdAt: -1, _id: -1 });
  const enriched = await Promise.all(list.map(async (s) => {
    const doc = s.toObject();
    if (!doc.patientName || !doc.doctorName) {
      if (!doc.patientName && doc.patientId) {
        const p = await Patient.findOne({ patientId: doc.patientId });
        if (p) doc.patientName = p.fullName;
      }
      if (!doc.doctorName && doc.doctorId) {
        const d = await Doctor.findOne({ doctorId: doc.doctorId });
        if (d) {
          doc.doctorName = d.name;
          doc.doctorSpecialty = d.specialty || d.department;
        }
      }
    }
    if (!doc.time && doc.scheduledAt) {
      doc.time = new Date(doc.scheduledAt).toLocaleString();
    }
    return doc;
  }));
  return enriched;
}

export async function bookSurgery({ patientId, procedure, doctorId, operatingTheatre, time, notes }, actor) {
  let patient = await Patient.findOne({ patientId });
  if (!patient && patientId) {
    patient = await Patient.findById(patientId).catch(() => null);
  }
  if (!patient) throw new Error('Patient not found');

  let doctor = await Doctor.findOne({ doctorId });
  if (!doctor && doctorId) {
    doctor = await Doctor.findById(doctorId).catch(() => null);
  }
  if (!doctor) {
    doctor = await Doctor.findOne({});
  }

  const activeEpisode = await TreatmentEpisode.findOne({ patientId: patient.patientId, status: 'ACTIVE' });
  const treatmentEpisodeId = activeEpisode ? activeEpisode.episodeId : 'EP-GLOBAL';

  const count = await Surgery.countDocuments();
  const surgeryId = `SURG-${Date.now().toString().slice(-5)}-${String(count + 1).padStart(3, '0')}`;

  let parsedDate = time ? new Date(time) : new Date();
  if (isNaN(parsedDate.getTime())) {
    if (typeof time === 'string' && /^\d{1,2}:\d{2}/.test(time)) {
      const today = new Date().toISOString().split('T')[0];
      parsedDate = new Date(`${today}T${time}`);
    }
  }
  if (isNaN(parsedDate.getTime())) {
    parsedDate = new Date(Date.now() + 2 * 3600 * 1000);
  }

  const surgery = new Surgery({
    surgeryId,
    patientId: patient.patientId,
    patientName: patient.fullName,
    treatmentEpisodeId,
    doctorId: doctor?.doctorId || doctorId || 'DOC-DEFAULT',
    doctorName: doctor?.name || 'Assigned Surgeon',
    doctorSpecialty: doctor?.specialty || doctor?.department || 'Surgery',
    operatingTheatre: operatingTheatre || 'OT-01',
    procedure,
    scheduledAt: parsedDate,
    time: time || parsedDate.toLocaleString(),
    notes: notes || '',
    status: 'SCHEDULED'
  });

  await surgery.save();

  // Insert event into doctor clinical schedule feed
  const evCount = await ScheduleEvent.countDocuments();
  const eventId = `EV-${Date.now().toString().slice(-5)}-${String(evCount + 1).padStart(3, '0')}`;
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
      time: time || parsedDate.toISOString(),
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
    metadata: { procedure, operatingTheatre, time, patientName: patient.fullName, doctorName: doctor.name }
  });

  return surgery;
}

export async function updateSurgeryStatus(surgeryId, updatePayload, actor) {
  const cleanId = String(surgeryId || '').trim();
  const surgery = await Surgery.findOne({ surgeryId: cleanId });
  if (!surgery) throw new Error('Surgery record not found');

  const newStatus = String(updatePayload.status || '').toUpperCase();
  if (!['SCHEDULED', 'PREPARING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(newStatus)) {
    throw new Error(`Invalid surgery status: ${updatePayload.status}`);
  }

  surgery.status = newStatus;

  if (updatePayload.operatingTheatre) surgery.operatingTheatre = updatePayload.operatingTheatre;
  if (updatePayload.notes !== undefined) surgery.notes = updatePayload.notes;

  // Handle COMPLETED operation
  if (newStatus === 'COMPLETED') {
    surgery.completedAt = updatePayload.completedAt ? new Date(updatePayload.completedAt) : new Date();
    surgery.outcome = updatePayload.outcome || surgery.outcome || 'Successful';
    if (updatePayload.durationMinutes) {
      surgery.durationMinutes = Number(updatePayload.durationMinutes);
    } else if (surgery.scheduledAt) {
      const diffMs = surgery.completedAt.getTime() - new Date(surgery.scheduledAt).getTime();
      surgery.durationMinutes = Math.max(15, Math.round(diffMs / (1000 * 60)));
    }

    const targetDocId = updatePayload.doctorId || surgery.doctorId;
    let perfDoctor = null;
    if (targetDocId) {
      perfDoctor = await Doctor.findOne({ doctorId: targetDocId });
    }
    surgery.performedBy = {
      doctorId: targetDocId,
      doctorName: perfDoctor ? perfDoctor.name : surgery.doctorName,
      specialty: perfDoctor ? (perfDoctor.specialty || perfDoctor.department) : (surgery.doctorSpecialty || 'General Surgery')
    };
    if (perfDoctor) {
      surgery.doctorId = perfDoctor.doctorId;
      surgery.doctorName = perfDoctor.name;
      surgery.doctorSpecialty = perfDoctor.specialty || perfDoctor.department;
    }

    // Sync active Treatment Episode
    const activeEp = await TreatmentEpisode.findOne({ patientId: surgery.patientId, status: 'ACTIVE' });
    if (activeEp && activeEp.surgeries) {
      const matchingSurg = activeEp.surgeries.find(s => 
        s.procedure === surgery.procedure || s.theatre === surgery.operatingTheatre
      );
      if (matchingSurg) {
        matchingSurg.status = 'Completed';
      } else {
        activeEp.surgeries.push({
          procedure: surgery.procedure,
          time: new Date().toISOString(),
          theatre: surgery.operatingTheatre,
          status: 'Completed'
        });
      }
      await activeEp.save();
    }

    await logAction({
      actor: typeof actor === 'object' ? (actor.name || actor.id || 'admin') : (actor || 'admin'),
      action: `Surgery Completed: ${surgery.procedure}`,
      entityType: 'Surgery',
      entityId: surgery.surgeryId,
      metadata: {
        procedure: surgery.procedure,
        patientId: surgery.patientId,
        patientName: surgery.patientName,
        doctorId: surgery.doctorId,
        doctorName: surgery.doctorName,
        operatingTheatre: surgery.operatingTheatre,
        completedAt: surgery.completedAt,
        outcome: surgery.outcome,
        notes: surgery.notes
      }
    });
  }

  // Handle CANCELLED operation
  if (newStatus === 'CANCELLED') {
    surgery.cancelledAt = new Date();
    surgery.cancellationReason = updatePayload.cancellationReason || 'Cancelled by clinical administration';
    surgery.cancelledBy = typeof actor === 'object' ? (actor.name || actor.id || 'admin') : (actor || 'admin');

    const activeEp = await TreatmentEpisode.findOne({ patientId: surgery.patientId, status: 'ACTIVE' });
    if (activeEp && activeEp.surgeries) {
      const matchingSurg = activeEp.surgeries.find(s => 
        s.procedure === surgery.procedure || s.theatre === surgery.operatingTheatre
      );
      if (matchingSurg) {
        matchingSurg.status = 'Cancelled';
        await activeEp.save();
      }
    }

    await logAction({
      actor: typeof actor === 'object' ? (actor.name || actor.id || 'admin') : (actor || 'admin'),
      action: `Surgery Cancelled: ${surgery.procedure}`,
      entityType: 'Surgery',
      entityId: surgery.surgeryId,
      metadata: {
        procedure: surgery.procedure,
        patientId: surgery.patientId,
        reason: surgery.cancellationReason
      }
    });
  }

  // Archive any pending notifications for completed or cancelled surgeries so doctors never get stale toasts
  if (newStatus === 'CANCELLED' || newStatus === 'COMPLETED') {
    try {
      const Notification = (await import('../models/Notification.js')).default;
      await Notification.updateMany(
        { relatedEntity: 'Surgery', relatedEntityId: surgery.surgeryId },
        { $set: { status: 'ARCHIVED', archivedAt: new Date() } }
      );
    } catch (_) {}
  }

  await surgery.save();
  return surgery;
}
