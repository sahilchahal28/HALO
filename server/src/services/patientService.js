import Patient from '../models/Patient.js';
import Doctor from '../models/Doctor.js';
import TreatmentEpisode from '../models/TreatmentEpisode.js';
import MedicalDocument from '../models/MedicalDocument.js';
import { generatePatientId } from '../utils/patientIdGenerator.js';
import { generateEpisodeId } from '../utils/episodeIdGenerator.js';
import { generateQrToken } from '../utils/qrTokenGenerator.js';
import { logAction } from './auditService.js';
import { buildLocalDownloadUrl } from '../config/localStorage.js';
import { assertPatientAccess } from './accessControl.js';
import { fileExtensionFor } from '../utils/mimeTypes.js';

export async function registerPatient(patientData, actor) {
  const cleanAadhaar = String(patientData.aadhaarNumber || '').replace(/\D/g, '');
  if (!cleanAadhaar || cleanAadhaar.length !== 12) {
    const err = new Error('A valid 12-digit Aadhaar number is mandatory for registration.');
    err.statusCode = 400;
    throw err;
  }

  // Enforce unique Aadhaar check across patients (names can be identical, but Aadhaar must be unique)
  const existingPatient = await Patient.findOne({ aadhaarNumber: cleanAadhaar });
  if (existingPatient) {
    const formattedAadhaar = cleanAadhaar.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3');
    const err = new Error(`A patient with Aadhaar number ${formattedAadhaar} is already registered (Patient ID: ${existingPatient.patientId}, Name: ${existingPatient.fullName}). Duplicate registration is not permitted.`);
    err.statusCode = 409;
    throw err;
  }

  const count = await Patient.countDocuments();
  const patientId = await generatePatientId();
  const qrCodeToken = generateQrToken(patientData.name, count);

  // Parse arrays
  const allergies = Array.isArray(patientData.allergies) 
    ? patientData.allergies 
    : patientData.allergies ? patientData.allergies.split(',').map(s => s.trim()) : [];
  const medicalHistory = Array.isArray(patientData.medicalHistory) 
    ? patientData.medicalHistory 
    : patientData.medicalHistory ? patientData.medicalHistory.split(',').map(s => s.trim()) : [];

  const patient = new Patient({
    patientId,
    aadhaarNumber: cleanAadhaar,
    fullName: patientData.name, // maps to fullName in Mongoose schema
    phone: patientData.phone,
    dateOfBirth: patientData.dob,
    age: Number(patientData.age),
    gender: patientData.gender,
    bloodGroup: patientData.bloodGroup,
    address: patientData.address,
    emergencyContact: patientData.emergencyContact,
    allergies,
    medicalHistory,
    qrCodeToken
  });

  await patient.save();

  await logAction({
    actor: actor || 'admin',
    action: 'Patient registered',
    entityType: 'Patient',
    entityId: patientId,
    metadata: { patientId, name: patientData.name }
  });

  return patient;
}

export async function getPatients() {
  return await Patient.find({}).populate('assignedDoctor');
}

export async function lookupPatient({ token, patientId }, actor = null) {
  let patient = null;
  const rawToken = String(token || '').trim();
  const rawId = String(patientId || '').trim();

  // 1. Try finding by qrCodeToken
  if (rawToken) {
    patient = await Patient.findOne({ qrCodeToken: rawToken });

    // Fallback: token might actually be the patientId, Aadhaar, or phone
    if (!patient) {
      patient = await Patient.findOne({
        $expr: { $eq: [{ $toUpper: '$patientId' }, rawToken.toUpperCase()] }
      });
    }

    if (!patient && /^\d+$/.test(rawToken)) {
      patient = await Patient.findOne({
        $or: [
          { aadhaarNumber: rawToken },
          { phone: rawToken },
          { phone: `+91${rawToken}` }
        ]
      });
    }
  }

  // 2. If not found by token, try by patientId / name / Aadhaar
  if (!patient && rawId) {
    const cleanId = rawId.toUpperCase();
    patient = await Patient.findOne({
      $or: [
        { $expr: { $eq: [{ $toUpper: '$patientId' }, cleanId] } },
        { qrCodeToken: rawId },
        { aadhaarNumber: rawId.replace(/\D/g, '') },
        { fullName: new RegExp(`^${rawId}$`, 'i') }
      ]
    });
  }

  if (!patient) return null;

  // 3. Auto-assign scanning doctor if requested by a DOCTOR
  if (actor && actor.role === 'DOCTOR') {
    const docId = actor.id || actor.sub;
    if (docId) {
      try {
        await assignDoctor(patient.patientId, docId, actor.name || docId);
        // Reload fresh patient record
        patient = await Patient.findOne({ patientId: patient.patientId });
      } catch (err) {
        console.warn('[lookupPatient] Auto-assign doctor note:', err.message);
      }
    }
  }

  return await patient.populate('assignedDoctor');
}

export async function getPatientById(patientId) {
  const cleanId = String(patientId).trim().toUpperCase();
  return await Patient.findOne({ patientId: cleanId }).populate('assignedDoctor');
}

export async function updatePatient(patientId, updateData, actor) {
  const cleanId = String(patientId).trim().toUpperCase();
  const patient = await Patient.findOne({ patientId: cleanId });
  if (!patient) throw new Error('Patient not found');

  if (updateData.name) patient.fullName = updateData.name;
  if (updateData.fullName) patient.fullName = updateData.fullName;
  if (updateData.phone) patient.phone = updateData.phone;
  if (updateData.age) patient.age = Number(updateData.age);
  if (updateData.gender) patient.gender = updateData.gender;
  if (updateData.dob) patient.dateOfBirth = updateData.dob;
  if (updateData.bloodGroup) patient.bloodGroup = updateData.bloodGroup;
  if (updateData.address) patient.address = updateData.address;
  if (updateData.status) patient.status = updateData.status;

  if (updateData.emergencyContact) {
    patient.emergencyContact = {
      name: updateData.emergencyContact.name || patient.emergencyContact.name,
      phone: updateData.emergencyContact.phone || patient.emergencyContact.phone,
      relation: updateData.emergencyContact.relation || patient.emergencyContact.relation
    };
  }

  if (updateData.allergies) {
    patient.allergies = Array.isArray(updateData.allergies)
      ? updateData.allergies
      : updateData.allergies.split(',').map(s => s.trim());
  }

  if (updateData.medicalHistory) {
    patient.medicalHistory = Array.isArray(updateData.medicalHistory)
      ? updateData.medicalHistory
      : updateData.medicalHistory.split(',').map(s => s.trim());
  }

  await patient.save();

  await logAction({
    actor: actor || 'admin',
    action: `Patient profile updated: ${updateData.status ? 'Status to ' + updateData.status : 'details changed'}`,
    entityType: 'Patient',
    entityId: patientId,
    metadata: { updateData }
  });

  return patient.populate('assignedDoctor');
}

export async function assignDoctor(patientId, doctorId, actor) {
  const cleanPId = String(patientId || '').trim().toUpperCase();
  const cleanDId = String(doctorId || '').trim().toUpperCase();

  const patient = await Patient.findOne({
    $expr: { $eq: [{ $toUpper: '$patientId' }, cleanPId] }
  });
  if (!patient) throw new Error('Patient not found');

  const doctor = await Doctor.findOne({
    $expr: { $eq: [{ $toUpper: '$doctorId' }, cleanDId] }
  });
  if (!doctor) throw new Error('Doctor not found');

  patient.assignedDoctor = doctor._id;
  if (patient.status === 'INACTIVE') {
    patient.status = 'ACTIVE';
  }
  await patient.save();

  // Update active Treatment Episode if one exists, or create a new active episode
  let activeEpisode = await TreatmentEpisode.findOne({ patientId: patient.patientId, status: 'ACTIVE' });
  if (activeEpisode) {
    activeEpisode.doctorId = doctor.doctorId;
    activeEpisode.doctorName = doctor.name;
    if (doctor.phone) activeEpisode.doctorPhone = doctor.phone;
    await activeEpisode.save();
  } else {
    const count = await TreatmentEpisode.countDocuments();
    const episodeId = `EP-${new Date().getFullYear()}-${String(count + 10001).padStart(5, '0')}`;
    activeEpisode = await TreatmentEpisode.create({
      episodeId,
      patientId: patient.patientId,
      patientName: patient.fullName || patient.name || 'Patient',
      doctorId: doctor.doctorId,
      doctorName: doctor.name,
      doctorPhone: doctor.phone || '',
      department: doctor.department || patient.department || 'General Medicine',
      currentStage: 'CONSULTATION',
      reason: 'Auto-assigned on Doctor QR Scan',
      admissionDate: new Date().toISOString(),
      status: 'ACTIVE',
      requiresAttention: false,
      consultations: [],
      prescriptions: [],
      tests: [],
      surgeries: [],
      messages: []
    });
  }

  await logAction({
    actor: actor || doctor.name || doctor.doctorId || 'admin',
    action: `Doctor Assigned: ${doctor.name}`,
    entityType: 'Patient',
    entityId: patient.patientId,
    metadata: { doctorId: doctor.doctorId, doctorName: doctor.name }
  });

  return patient.populate('assignedDoctor');
}

export async function admitPatient({ patientId, department, doctorId, reason }, actor) {
  const patient = await Patient.findOne({ patientId });
  if (!patient) throw new Error('Patient not found');

  const doctor = await Doctor.findOne({ doctorId });
  if (!doctor) throw new Error('Doctor not found');

  // Change patient status to ADMITTED, set department and doctor
  patient.status = 'ADMITTED';
  patient.department = department;
  patient.assignedDoctor = doctor._id;
  await patient.save();

  // Find or create active Treatment Episode
  let activeEpisode = await TreatmentEpisode.findOne({ patientId, status: 'ACTIVE' });
  if (!activeEpisode) {
    const episodeId = await generateEpisodeId();

    activeEpisode = new TreatmentEpisode({
      episodeId,
      patientId,
      patientName: patient.fullName,
      doctorId: doctor.doctorId,
      doctorName: doctor.name,
      status: 'ACTIVE',
      currentStage: 'ADMISSION',
      reason: reason || 'Inpatient Admission',
      department
    });
  } else {
    activeEpisode.currentStage = 'ADMISSION';
    activeEpisode.department = department;
    activeEpisode.doctorId = doctor.doctorId;
    activeEpisode.doctorName = doctor.name;
    if (reason) activeEpisode.reason = reason;
  }
  await activeEpisode.save();

  await logAction({
    actor: actor || 'admin',
    action: 'Patient Admitted',
    entityType: 'Patient',
    entityId: patientId,
    metadata: { department, doctorName: doctor.name, episodeId: activeEpisode.episodeId }
  });

  return patient.populate('assignedDoctor');
}

export async function getPatientDocuments(patientId, actor) {
  // Authorization: ADMIN unrestricted · PATIENT own records only ·
  // DOCTOR only when assigned to this patient.
  await assertPatientAccess(actor, patientId);

  const docs = await MedicalDocument.find({
    patientId: new RegExp(`^${patientId}$`, 'i'),
    status: { $in: ['ACTIVE', 'ARCHIVED'] }
  }).sort({ createdAt: -1, examinationDate: -1 });

  return docs.map(doc => {
    const obj = doc.toObject();
    if (doc.s3Key) {
      obj.downloadUrl = buildLocalDownloadUrl(
        doc.s3Key,
        `${doc.title}.${fileExtensionFor(doc.mimeType, doc.title)}`
      );
    }
    if (doc.retentionPolicy?.autoDelete && doc.retentionPolicy?.expiresAt) {
      const daysLeft = Math.max(
        0,
        Math.ceil((doc.retentionPolicy.expiresAt - Date.now()) / (1000 * 60 * 60 * 24))
      );
      obj.retentionNotice = `⚠️ Auto-deleted after 6 months (${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining)`;
    } else {
      obj.retentionNotice = 'Stored permanently';
    }
    return obj;
  });
}

export async function addPatientDocument(patientId, docData, actor = {}) {
  // Authorization: ADMIN unrestricted · PATIENT own records only ·
  // DOCTOR only when assigned to this patient.
  await assertPatientAccess(actor, patientId);

  const patient = await Patient.findOne({ patientId });
  if (!patient) throw new Error('Patient not found');

  const count = await MedicalDocument.countDocuments();
  const documentId = `DOC-${10000 + count}`;
  const s3Key = docData.s3Key || `records/${patientId}/${Date.now()}-${documentId.toLowerCase()}.pdf`;
  const mimeType = docData.mimeType || 'application/pdf';
  const fileSize = docData.fileSize || 1024;

  const isRetentionEligible = ['LAB_REPORT', 'IMAGING', 'TEST_REPORT'].includes(docData.type);
  const examDate = docData.examinationDate ? new Date(docData.examinationDate) : new Date();

  const retentionPolicy = isRetentionEligible
    ? {
        policyType: 'SIX_MONTHS_AUTO_DELETE',
        autoDelete: true,
        retentionDays: 180,
        expiresAt: new Date(examDate.getTime() + 180 * 24 * 60 * 60 * 1000),
      }
    : {
        policyType: 'PERMANENT',
        autoDelete: false,
        retentionDays: 0,
        expiresAt: null,
      };

  const document = new MedicalDocument({
    documentId,
    patientId,
    treatmentEpisodeId: docData.treatmentEpisodeId || null,
    type: docData.type,
    title: docData.title,
    mimeType,
    fileSize,
    s3Key,
    fileRef: s3Key,
    department: docData.department || 'GENERAL',
    doctor: docData.doctor || null,
    doctorId: docData.doctorId || null,
    examinationDate: examDate,
    status: 'ACTIVE',
    retentionPolicy,
    uploadedBy: actor.name || actor.id || 'admin',
    uploadedByRole: actor.role || 'ADMIN',
  });

  await document.save();

  await logAction({
    actor: actor || 'admin',
    action: 'Document Uploaded',
    entityType: 'Patient',
    entityId: patientId,
    metadata: { title: docData.title, type: docData.type, documentId, s3Key }
  });

  return document;
}

export async function deletePatient(patientId, actor) {
  const patient = await Patient.findOne({ patientId });
  if (!patient) throw new Error('Patient not found');

  await Patient.deleteOne({ patientId });
  await TreatmentEpisode.deleteMany({ patientId });
  await MedicalDocument.deleteMany({ patientId });

  await logAction({
    actor: actor || 'admin',
    action: 'Patient record deleted',
    entityType: 'Patient',
    entityId: patientId,
    metadata: { patientId, name: patient.fullName }
  });

  return { success: true, patientId };
}
