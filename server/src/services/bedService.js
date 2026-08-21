import Bed from '../models/Bed.js';
import Patient from '../models/Patient.js';
import TreatmentEpisode from '../models/TreatmentEpisode.js';
import { generateEpisodeId } from '../utils/episodeIdGenerator.js';
import { logAction } from './auditService.js';

export async function getBeds() {
  return await Bed.find({});
}

export async function assignBed(bedId, patientId, actor) {
  const bed = await Bed.findOne({ bedId });
  if (!bed) throw new Error('Bed location not found');
  if (bed.status !== 'AVAILABLE') throw new Error('Bed is not currently available for admission');

  const patient = await Patient.findOne({ patientId });
  if (!patient) throw new Error('Patient not found');

  // Verify patient has active clinical episode or auto-create one.
  // NOTE: a doctor is NEVER assigned here. Assignment happens exclusively
  // when a doctor scans the patient's QR code (or claims via attention toggle).
  let activeEpisode = await TreatmentEpisode.findOne({ patientId, status: 'ACTIVE' });
  if (!activeEpisode) {
    patient.status = 'ADMITTED';
    patient.department = bed.department;
    await patient.save();

    const episodeId = await generateEpisodeId();

    activeEpisode = new TreatmentEpisode({
      episodeId,
      patientId,
      patientName: patient.fullName,
      doctorId: 'UNASSIGNED',
      doctorName: 'Awaiting QR Scan',
      status: 'ACTIVE',
      currentStage: 'ADMISSION',
      reason: 'Inpatient Ward Admission',
      department: bed.department
    });
    await activeEpisode.save();
  }

  // Ensure patient is not already assigned to another bed
  const currentAssignment = await Bed.findOne({ patientId });
  if (currentAssignment) throw new Error(`Patient is already assigned to location ${currentAssignment.bedId}`);

  // Assign bed
  bed.status = 'OCCUPIED';
  bed.patientId = patientId;
  bed.patientName = patient.fullName;
  bed.episodeId = activeEpisode.episodeId;
  await bed.save();

  // Update Patient document currentBed
  patient.status = 'ADMITTED';
  patient.currentBed = bedId;
  await patient.save();

  // Update Episode stage & Add billing charge
  activeEpisode.bedAssignment = {
    bedId,
    assignedAt: new Date()
  };
  activeEpisode.currentStage = 'ADMISSION';
  activeEpisode.billing.push({
    description: `Inpatient Admission Bed - ${bedId}`,
    category: 'Bed',
    quantity: 1,
    unitPrice: 2000,
    total: 2000,
    department: 'Admission',
    status: 'PENDING'
  });
  await activeEpisode.save();

  await logAction({
    actor: actor || 'admin',
    action: 'Bed Assigned',
    entityType: 'Bed',
    entityId: bedId,
    metadata: { patientId, episodeId: activeEpisode.episodeId }
  });

  return bed;
}

export async function cleanBed(bedId, actor) {
  const bed = await Bed.findOne({ bedId });
  if (!bed) throw new Error('Bed location not found');

  // Release patient if bed was occupied
  if (bed.patientId) {
    await Patient.updateOne({ patientId: bed.patientId }, { currentBed: null });
    const activeEpisode = await TreatmentEpisode.findOne({ patientId: bed.patientId, status: 'ACTIVE' });
    if (activeEpisode && activeEpisode.bedAssignment && !activeEpisode.bedAssignment.dischargedAt) {
      activeEpisode.bedAssignment.dischargedAt = new Date();
      await activeEpisode.save();
    }
  }
  
  bed.status = 'AVAILABLE';
  bed.patientId = null;
  bed.patientName = null;
  bed.episodeId = null;
  await bed.save();

  await logAction({
    actor: actor || 'admin',
    action: 'Bed Sanitized',
    entityType: 'Bed',
    entityId: bedId,
    metadata: {}
  });

  return bed;
}

export async function updateBedStatus(bedId, status, actor) {
  const bed = await Bed.findOne({ bedId });
  if (!bed) throw new Error('Bed location not found');

  const oldStatus = bed.status;
  bed.status = status; // 'AVAILABLE', 'OCCUPIED', 'CLEANING', 'UNAVAILABLE'

  // Release patient if transitioning away from occupied
  if (status !== 'OCCUPIED' && oldStatus === 'OCCUPIED') {
    const patientId = bed.patientId;
    if (patientId) {
      await Patient.updateOne({ patientId }, { currentBed: null });
      const activeEpisode = await TreatmentEpisode.findOne({ patientId, status: 'ACTIVE' });
      if (activeEpisode && activeEpisode.bedAssignment && !activeEpisode.bedAssignment.dischargedAt) {
        activeEpisode.bedAssignment.dischargedAt = new Date();
        await activeEpisode.save();
      }
    }
    bed.patientId = null;
    bed.patientName = null;
    bed.episodeId = null;
  }

  await bed.save();

  await logAction({
    actor: actor || 'admin',
    action: 'Bed Status Changed',
    entityType: 'Bed',
    entityId: bedId,
    metadata: { oldStatus, newStatus: status }
  });

  return bed;
}

export async function addBed(bedData, actor) {
  const existing = await Bed.findOne({ bedId: bedData.bedId });
  if (existing) throw new Error('Bed location ID already exists');

  const bed = new Bed({
    bedId: bedData.bedId,
    wardId: bedData.wardId || 'WARD-GEN',
    bedNumber: bedData.bedNumber || '1',
    status: bedData.status || 'AVAILABLE'
  });

  await bed.save();

  await logAction({
    actor: actor || 'admin',
    action: 'Bed Created',
    entityType: 'Bed',
    entityId: bed.bedId,
    metadata: { wardId: bed.wardId, bedNumber: bed.bedNumber }
  });

  return bed;
}

export async function removeBed(bedId, actor) {
  const bed = await Bed.findOne({ bedId });
  if (!bed) throw new Error('Bed location not found');

  if (bed.status === 'OCCUPIED') {
    throw new Error('Cannot delete an occupied bed location');
  }

  await Bed.deleteOne({ bedId });

  await logAction({
    actor: actor || 'admin',
    action: 'Bed Deleted',
    entityType: 'Bed',
    entityId: bedId,
    metadata: {}
  });

  return { message: 'Bed removed successfully' };
}
