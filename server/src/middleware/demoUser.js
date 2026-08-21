import Doctor from '../models/Doctor.js';
import Patient from '../models/Patient.js';

export async function demoUser(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  try {
    if (token === 'mock-admin-token') {
      req.user = { id: 'admin', role: 'ADMIN', name: 'Sarah Jenkins (Admin)' };
    } else if (token && token.startsWith('mock-doctor-token:')) {
      const doctorId = token.split(':')[1];
      const doctor = await Doctor.findOne({ doctorId });
      if (doctor) {
        req.user = { id: doctor.doctorId, role: 'DOCTOR', name: doctor.name };
      } else {
        req.user = { id: doctorId, role: 'DOCTOR', name: 'Dr. Feed' };
      }
    } else if (token && token.startsWith('mock-patient-token:')) {
      const patientId = token.split(':')[1];
      const patient = await Patient.findOne({ patientId });
      if (patient) {
        req.user = { id: patient.patientId, role: 'PATIENT', name: patient.fullName, patientId: patient.patientId };
      } else {
        req.user = { id: patientId, role: 'PATIENT', name: 'Patient Profile', patientId };
      }
    } else {
      // Default fallback demo user (Admin) to ensure dashboard calls function
      req.user = { id: 'admin', role: 'ADMIN', name: 'Sarah Jenkins (Admin)' };
    }
  } catch (err) {
    console.error('Auth middleware error:', err);
  }
  next();
}
