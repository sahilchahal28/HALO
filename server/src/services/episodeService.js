import TreatmentEpisode from '../models/TreatmentEpisode.js';
import Patient from '../models/Patient.js';
import Doctor from '../models/Doctor.js';
import Bed from '../models/Bed.js';
import Notification from '../models/Notification.js';
import Prescription from '../models/Prescription.js';
import { generateEpisodeId } from '../utils/episodeIdGenerator.js';
import { logAction } from './auditService.js';

export async function getEpisodes(patientId) {
  const query = {};
  if (patientId) query.patientId = patientId;
  return await TreatmentEpisode.find(query);
}

export async function createEpisode({ patientId, doctorId }, actor) {
  // Fetch patient & doctor details for caching
  const patient = await Patient.findOne({ patientId });
  if (!patient) throw new Error('Patient not found');
  const doctor = await Doctor.findOne({ doctorId });
  if (!doctor) throw new Error('Doctor not found');

  const episodeId = await generateEpisodeId();

  const episode = new TreatmentEpisode({
    episodeId,
    patientId,
    patientName: patient.fullName,
    doctorId,
    doctorName: doctor.name,
    doctorPhone: doctor.phone || '',
    status: 'ACTIVE',
    currentStage: 'REGISTRATION'
  });

  await episode.save();

  await logAction({
    actor: actor || 'admin',
    action: 'Treatment Episode created',
    entityType: 'TreatmentEpisode',
    entityId: episodeId,
    metadata: { patientId, doctorId }
  });

  return episode;
}

export async function updateEpisode(episodeId, updateData, actor) {
  const episode = await TreatmentEpisode.findOne({ episodeId });
  if (!episode) throw new Error('Treatment Episode not found');

  // Handle consultation additions
  if (updateData.consultation) {
    episode.consultations.push({
      notes: updateData.consultation.notes,
      diagnosis: updateData.consultation.diagnosis
    });
    episode.currentStage = 'CONSULTATION';
    
    // Auto-charge consultation fee
    episode.billing.push({
      description: 'Consultation Assessment - ' + episode.doctorName,
      category: 'Consultation',
      quantity: 1,
      unitPrice: 500,
      total: 500,
      department: 'Outpatient',
      status: 'PENDING'
    });

    await logAction({
      actor: actor || 'doctor',
      action: 'Consultation Logged',
      entityType: 'Patient',
      entityId: episode.patientId,
      metadata: { diagnosis: updateData.consultation.diagnosis }
    });
  }

  // Handle prescription additions (Structured medicines mapping)
  if (updateData.prescription) {
    episode.prescriptions.push({
      medicine: updateData.prescription.medicine,
      dosage: updateData.prescription.dosage,
      frequency: updateData.prescription.frequency,
      duration: updateData.prescription.duration,
      originalImagePath: updateData.prescription.originalImagePath,
      isDigitized: updateData.prescription.isDigitized || false
    });
    episode.currentStage = 'TREATMENT';

    // Save standalone Prescription document
    const rxCount = await Prescription.countDocuments();
    const prescriptionId = `PR-${String(rxCount + 1).padStart(6, '0')}`;
    const rxDoc = new Prescription({
      prescriptionId,
      patientId: episode.patientId,
      treatmentEpisodeId: episode.episodeId,
      doctorId: episode.doctorId,
      medicines: [{
        name: updateData.prescription.medicine,
        dosage: updateData.prescription.dosage,
        frequency: updateData.prescription.frequency,
        duration: updateData.prescription.duration,
        instructions: updateData.prescription.instructions || ''
      }],
      notes: updateData.prescription.notes || ''
    });
    await rxDoc.save();

    // Auto-charge prescription medicine fee
    episode.billing.push({
      description: 'Pharmacy Issue - ' + updateData.prescription.medicine,
      category: 'Medicine',
      quantity: 1,
      unitPrice: 350,
      total: 350,
      department: 'Pharmacy',
      status: 'PENDING'
    });

    await logAction({
      actor: actor || 'doctor',
      action: 'Prescription Created',
      entityType: 'Patient',
      entityId: episode.patientId,
      metadata: { medicine: updateData.prescription.medicine, prescriptionId }
    });

    // Parse duration (e.g. "5 days" -> 5)
    let durationDays = 5;
    const match = (updateData.prescription.duration || '').match(/\d+/);
    if (match) durationDays = parseInt(match[0]);

    // Parse frequency (e.g. "1-0-1" -> morning: true, afternoon: false, night: true)
    const freqParts = (updateData.prescription.frequency || '').split('-');
    const morningDose = freqParts[0] && parseInt(freqParts[0]) > 0;
    const afternoonDose = freqParts[1] && parseInt(freqParts[1]) > 0;
    const nightDose = freqParts[2] && parseInt(freqParts[2]) > 0;

    const today = new Date();
    for (let d = 0; d < durationDays; d++) {
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + d);
      const dateString = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD

      if (morningDose) {
        episode.reminders.push({
          medicine: updateData.prescription.medicine,
          dosage: updateData.prescription.dosage || '1 tablet',
          timeOfDay: 'MORNING',
          dateString,
          status: 'PENDING'
        });
      }
      if (afternoonDose) {
        episode.reminders.push({
          medicine: updateData.prescription.medicine,
          dosage: updateData.prescription.dosage || '1 tablet',
          timeOfDay: 'AFTERNOON',
          dateString,
          status: 'PENDING'
        });
      }
      if (nightDose) {
        episode.reminders.push({
          medicine: updateData.prescription.medicine,
          dosage: updateData.prescription.dosage || '1 tablet',
          timeOfDay: 'NIGHT',
          dateString,
          status: 'PENDING'
        });
      }
    }
  }

  // Handle lab test additions
  if (updateData.testName) {
    episode.tests.push({
      name: updateData.testName,
      status: 'PENDING'
    });
    episode.currentStage = 'INVESTIGATION';

    // Auto-charge lab diagnostic test fee
    episode.billing.push({
      description: 'Diagnostic Lab Test - ' + updateData.testName,
      category: 'Lab Test',
      quantity: 1,
      unitPrice: 750,
      total: 750,
      department: 'Laboratory',
      status: 'PENDING'
    });

    await logAction({
      actor: actor || 'doctor',
      action: 'Investigation Ordered',
      entityType: 'Patient',
      entityId: episode.patientId,
      metadata: { testName: updateData.testName }
    });
  }

  // Handle doctor reassignment when doctor scans QR code or sets attention toggle
  if (updateData.doctorId) {
    const doc = await Doctor.findOne({ doctorId: updateData.doctorId });
    // Never write an assignment to a non-existent/ghost doctor profile —
    // that would leave a stale doctorName on the episode.
    if (!doc) {
      const err = new Error('Doctor profile not found. Please sign in again and rescan.');
      err.statusCode = 400;
      throw err;
    }
    // Verified against the DB — the record is the single source of truth for
    // identity fields; client-sent names/phones are ignored on reassignment.
    episode.doctorId = doc.doctorId;
    episode.doctorName = doc.name;
    if (doc.phone) episode.doctorPhone = doc.phone;
  } else {
    if (updateData.doctorName) episode.doctorName = updateData.doctorName;
    if (updateData.doctorPhone) episode.doctorPhone = updateData.doctorPhone;
  }

  // Handle direct attention toggle (exclusive to only one marked patient per doctor)
  if (updateData.requiresAttention !== undefined) {
    if (updateData.requiresAttention === true) {
      await TreatmentEpisode.updateMany(
        { doctorId: episode.doctorId, episodeId: { $ne: episode.episodeId }, status: 'ACTIVE' },
        { $set: { requiresAttention: false } }
      );
      episode.requiresAttention = true;
    } else {
      episode.requiresAttention = false;
    }
  }

  // Handle chat messages
  if (updateData.message) {
    episode.messages.push({
      sender: updateData.message.sender,
      text: updateData.message.text
    });
  }

  // Handle manual billing item addition
  if (updateData.billItem) {
    const qty = Number(updateData.billItem.quantity) || 1;
    const price = Number(updateData.billItem.unitPrice) || 0;
    episode.billing.push({
      description: updateData.billItem.description,
      category: updateData.billItem.category || 'Other',
      quantity: qty,
      unitPrice: price,
      total: qty * price,
      department: updateData.billItem.department || 'Billing',
      status: 'PENDING'
    });
  }

  // Handle manual billing item payment status change
  if (updateData.payBillItem) {
    const bItem = episode.billing.id(updateData.payBillItem.itemId);
    if (bItem) {
      bItem.status = 'PAID';
    }
  }

  // Handle reminder action (taken/skipped status update)
  if (updateData.reminderAction) {
    const rem = episode.reminders.id(updateData.reminderAction.reminderId);
    if (rem) {
      rem.status = updateData.reminderAction.status;
      
      // Log action
      await logAction({
        actor: actor || 'patient',
        action: `Medicine reminder marked ${updateData.reminderAction.status}: ${rem.medicine} (${rem.timeOfDay})`,
        entityType: 'TreatmentEpisode',
        entityId: episodeId,
        metadata: { reminderId: rem._id, status: rem.status, patientId: episode.patientId }
      });
    }
  }

  // Handle department transfer
  if (updateData.department) {
    const prevDept = episode.department || 'General Medicine';
    episode.department = updateData.department;
    await Patient.updateOne({ patientId: episode.patientId }, { department: updateData.department });

    const notifId = `NOT-${Math.floor(100000 + Math.random() * 900000)}`;
    await Notification.create({
      notificationId: notifId,
      recipientType: 'DOCTOR',
      recipientId: episode.doctorId,
      type: 'TRANSFER',
      title: 'Patient Transferred Department',
      message: `Patient ${episode.patientName} (${episode.patientId}) was transferred: ${prevDept} → ${updateData.department}.`,
      relatedEntity: 'TreatmentEpisode',
      relatedEntityId: episode.episodeId,
      patientId: episode.patientId
    });

    await logAction({
      actor: actor || 'admin',
      action: 'Department transfer',
      entityType: 'TreatmentEpisode',
      entityId: episode.episodeId,
      metadata: { from: prevDept, to: updateData.department, patientId: episode.patientId }
    });
  }

  // Handle general updates
  if (updateData.currentStage) episode.currentStage = updateData.currentStage;
  if (updateData.diagnosisInformation) episode.diagnosisInformation = updateData.diagnosisInformation;

  await episode.save();

  await logAction({
    actor: actor || 'doctor',
    action: 'Treatment Episode updated',
    entityType: 'TreatmentEpisode',
    entityId: episodeId,
    metadata: { updateData }
  });

  return episode;
}

export async function dischargePatient(episodeId, { summary }, actor) {
  const episode = await TreatmentEpisode.findOne({ episodeId });
  if (!episode) throw new Error('Treatment Episode not found');

  episode.status = 'COMPLETED';
  episode.currentStage = 'DISCHARGE';
  episode.dischargeSummary = summary || 'Discharged in stable condition.';
  episode.endDate = new Date();
  episode.requiresAttention = false; // Disable call capability immediately

  await episode.save();

  // Reset Patient status and clear bed assignment
  const patient = await Patient.findOne({ patientId: episode.patientId });
  if (patient) {
    patient.status = 'ACTIVE';
    patient.currentBed = null;
    await patient.save();
  }

  // Release associated bed immediately if assigned
  const assignedBed = await Bed.findOne({ $or: [{ episodeId }, { patientId: episode.patientId }] });
  if (assignedBed) {
    assignedBed.status = 'CLEANING'; // Set to cleaning per hospital flow rules
    assignedBed.patientId = null;
    assignedBed.patientName = null;
    assignedBed.episodeId = null;
    await assignedBed.save();
  }

  await logAction({
    actor: actor || 'doctor',
    action: 'Patient Discharged',
    entityType: 'Patient',
    entityId: episode.patientId,
    metadata: { summary }
  });

  return episode;
}
