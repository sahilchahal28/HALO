import AmbulanceRequest from '../models/AmbulanceRequest.js';
import Ambulance from '../models/Ambulance.js';
import Patient from '../models/Patient.js';
import Doctor from '../models/Doctor.js';
import Notification from '../models/Notification.js';
import TreatmentEpisode from '../models/TreatmentEpisode.js';
import { logAction } from './auditService.js';

export async function getAmbulanceRequests() {
  return await AmbulanceRequest.find({});
}

export async function createAmbulanceRequest(requestData, patientId) {
  const patient = await Patient.findOne({ patientId });
  if (!patient) throw new Error('Patient not found');

  const count = await AmbulanceRequest.countDocuments();
  const requestId = `AMB-${10000 + count}`;

  // Find a doctor to alert
  const doctor = await Doctor.findOne({ status: 'ACTIVE' });
  const assignedDoctorId = doctor ? doctor.doctorId : 'doctor1';
  const assignedDoctorName = doctor ? doctor.name : 'Dr. Ananya Iyer';

  const request = new AmbulanceRequest({
    requestId,
    patientId,
    patientName: patient.fullName,
    condition: requestData.condition,
    location: requestData.location,
    contact: requestData.phone,
    assignedDoctorId,
    assignedDoctorName,
    status: 'REQUESTED'
  });

  await request.save();

  // Auto charge ambulance fee to active care episode
  const activeEpisode = await TreatmentEpisode.findOne({ patientId, status: 'ACTIVE' });
  if (activeEpisode) {
    activeEpisode.billing.push({
      description: `Emergency Ambulance Dispatch - ${requestData.location}`,
      category: 'Ambulance',
      quantity: 1,
      unitPrice: 1200,
      total: 1200,
      department: 'Emergency',
      status: 'PENDING'
    });
    activeEpisode.ambulanceEvents.push(`Ambulance requested: ${requestData.condition}`);
    await activeEpisode.save();
  }

  // Trigger Doctor Notification
  const notifId = `NOT-${Math.floor(100000 + Math.random() * 900000)}`;
  await Notification.create({
    notificationId: notifId,
    recipientType: 'DOCTOR',
    recipientId: assignedDoctorId,
    type: 'AMBULANCE',
    title: 'Emergency: Ambulance Dispatch Requested',
    message: `${patient.fullName} has requested ambulance dispatch. Location: ${requestData.location}. Symptoms: ${requestData.condition}.`,
    relatedEntity: 'AmbulanceRequest',
    relatedEntityId: requestId,
    patientId
  });

  await logAction({
    actor: patientId,
    action: 'Ambulance Requested',
    entityType: 'AmbulanceRequest',
    entityId: requestId,
    metadata: { condition: requestData.condition, location: requestData.location }
  });

  return request;
}

export async function updateAmbulanceStatus(requestId, status, actor, bodyData = {}) {
  const request = await AmbulanceRequest.findOne({ requestId });
  if (!request) throw new Error('Ambulance request not found');

  const oldStatus = request.status;
  request.status = status;
  
  if (status === 'ASSIGNED') {
    request.assignedAt = new Date();
    
    let ambulance = null;
    if (bodyData.ambulanceId) {
      ambulance = await Ambulance.findOne({ ambulanceId: bodyData.ambulanceId });
    } else {
      ambulance = await Ambulance.findOne({ status: 'AVAILABLE' });
    }

    if (ambulance) {
      request.assignedAmbulanceId = ambulance.ambulanceId;
      request.driverName = ambulance.driverName;
      request.driverPhone = ambulance.driverPhone;
      request.plateNumber = ambulance.plateNumber;
      
      ambulance.status = 'DISPATCHED';
      await ambulance.save();
    }
  }

  if (status === 'ARRIVED') request.arrivedAt = new Date();
  
  if (status === 'COMPLETED') {
    request.completedAt = new Date();
    if (request.assignedAmbulanceId) {
      const ambulance = await Ambulance.findOne({ ambulanceId: request.assignedAmbulanceId });
      if (ambulance) {
        ambulance.status = 'AVAILABLE';
        await ambulance.save();
      }
    }
  }

  await request.save();

  // Create notifications depending on status change
  if (status === 'EN_ROUTE' && request.assignedDoctorId) {
    const notifId = `NOT-${Math.floor(100000 + Math.random() * 900000)}`;
    await Notification.create({
      notificationId: notifId,
      recipientType: 'DOCTOR',
      recipientId: request.assignedDoctorId,
      type: 'AMBULANCE',
      title: 'Ambulance En Route',
      message: `Ambulance for ${request.patientName} is now en route to the hospital. Prepare arrival protocols.`,
      relatedEntity: 'AmbulanceRequest',
      relatedEntityId: requestId,
      patientId: request.patientId
    });
  }

  await logAction({
    actor: actor || 'admin',
    action: `Ambulance status updated: ${status}`,
    entityType: 'AmbulanceRequest',
    entityId: requestId,
    metadata: { oldStatus, newStatus: status }
  });

  return request;
}

export async function getAmbulanceVehicles() {
  return await Ambulance.find({});
}

export async function addAmbulanceVehicle(vehicleData, actor) {
  const count = await Ambulance.countDocuments();
  const ambulanceId = `AMB-${100 + count}`;

  const vehicle = new Ambulance({
    ambulanceId,
    plateNumber: vehicleData.plateNumber,
    driverName: vehicleData.driverName,
    driverPhone: vehicleData.driverPhone,
    status: vehicleData.status || 'AVAILABLE'
  });

  await vehicle.save();

  await logAction({
    actor: actor || 'admin',
    action: 'Ambulance Vehicle Registered',
    entityType: 'Ambulance',
    entityId: ambulanceId,
    metadata: { plateNumber: vehicle.plateNumber, driverName: vehicle.driverName }
  });

  return vehicle;
}

export async function removeAmbulanceVehicle(ambulanceId, actor) {
  const vehicle = await Ambulance.findOne({ ambulanceId });
  if (!vehicle) throw new Error('Vehicle not found');
  
  if (vehicle.status === 'DISPATCHED') {
    throw new Error('Cannot delete a dispatched vehicle');
  }

  await Ambulance.deleteOne({ ambulanceId });

  await logAction({
    actor: actor || 'admin',
    action: 'Ambulance Vehicle Removed',
    entityType: 'Ambulance',
    entityId: ambulanceId,
    metadata: {}
  });

  return { message: 'Vehicle deleted successfully' };
}
