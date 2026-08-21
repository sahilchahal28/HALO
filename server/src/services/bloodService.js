import BloodInventory from '../models/BloodInventory.js';
import BloodRequirement from '../models/BloodRequirement.js';
import BloodDonor from '../models/BloodDonor.js';
import Notification from '../models/Notification.js';
import TreatmentEpisode from '../models/TreatmentEpisode.js';
import Patient from '../models/Patient.js';
import { logAction } from './auditService.js';

export async function getBloodInventory() {
  return await BloodInventory.find({});
}

export async function getEligibleDonors(bloodGroup) {
  return await BloodDonor.find({
    bloodGroup,
    eligibilityStatus: 'ELIGIBLE',
    emergencyContactConsent: true
  });
}

export async function createRequirement({ bloodGroup, unitsRequired }, patientId, actor) {
  const patient = await Patient.findOne({ patientId });
  if (!patient) throw new Error('Patient not found');

  const activeEpisode = await TreatmentEpisode.findOne({ patientId, status: 'ACTIVE' });
  const treatmentEpisodeId = activeEpisode ? activeEpisode.episodeId : 'EP-GLOBAL';

  // Check inventory stock levels
  const inventory = await BloodInventory.findOne({ bloodGroup });
  const unitsAvailable = inventory ? inventory.unitsAvailable : 0;
  
  const shortage = Math.max(0, unitsRequired - unitsAvailable);

  const count = await BloodRequirement.countDocuments();
  const requirementId = `BLOOD-REQ-${10000 + count}`;

  const reqObj = new BloodRequirement({
    requirementId,
    patientId,
    treatmentEpisodeId,
    bloodGroup,
    unitsRequired,
    unitsAvailable,
    shortage,
    status: shortage > 0 ? 'PENDING' : 'RESOLVED'
  });

  await reqObj.save();

  if (shortage > 0) {
    // Generate Blood Shortage alert notification
    const notifId = `NOT-${Math.floor(100000 + Math.random() * 900000)}`;
    await Notification.create({
      notificationId: notifId,
      recipientType: 'ADMIN',
      recipientId: 'admin',
      type: 'BLOOD_ALERT',
      title: `Critical Shortage: Blood Group ${bloodGroup}`,
      message: `Emergency blood requirement booked for ${patient.fullName}. Required: ${unitsRequired} units. Stock shortage: ${shortage} units. Contact matching donors immediately.`,
      relatedEntity: 'BloodRequirement',
      relatedEntityId: requirementId,
      patientId
    });
  }

  await logAction({
    actor: actor || 'admin',
    action: 'Blood requirement registered',
    entityType: 'BloodRequirement',
    entityId: requirementId,
    metadata: { bloodGroup, unitsRequired, shortage }
  });

  return reqObj;
}

export async function updateBloodStock(bloodGroup, actionType, actor) {
  const inventory = await BloodInventory.findOne({ bloodGroup });
  if (!inventory) throw new Error('Blood inventory record not found');

  const oldUnits = inventory.unitsAvailable;
  if (actionType === 'INCREMENT') {
    inventory.unitsAvailable += 1;
  } else if (actionType === 'DECREMENT') {
    if (inventory.unitsAvailable <= 0) {
      throw new Error('Cannot reduce blood units below zero');
    }
    inventory.unitsAvailable -= 1;
  } else {
    throw new Error('Invalid stock update action');
  }

  await inventory.save();

  await logAction({
    actor: actor || 'admin',
    action: `Blood stock updated: ${actionType}`,
    entityType: 'BloodInventory',
    entityId: bloodGroup,
    metadata: { oldUnits, newUnits: inventory.unitsAvailable }
  });

  return inventory;
}

export async function getAllDonors() {
  return await BloodDonor.find({}).sort({ createdAt: -1 });
}

export async function createDonor(donorData) {
  const count = await BloodDonor.countDocuments();
  const donorId = `DONOR-${10000 + count + 1}`;
  const donor = new BloodDonor({
    donorId,
    name: donorData.name,
    bloodGroup: donorData.bloodGroup,
    phone: donorData.phone,
    location: donorData.location || 'Hospital Ward',
    eligibilityStatus: donorData.eligibilityStatus || 'ELIGIBLE',
    emergencyContactConsent: donorData.emergencyContactConsent !== false
  });
  await donor.save();
  return donor;
}

export async function deleteDonor(donorId) {
  const donor = await BloodDonor.findOne({ donorId });
  if (!donor) throw new Error('Donor not found');
  await BloodDonor.deleteOne({ donorId });
  return { success: true, donorId };
}
