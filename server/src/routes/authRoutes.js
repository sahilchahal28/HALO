import express from 'express';
import Doctor from '../models/Doctor.js';
import Patient from '../models/Patient.js';

const router = express.Router();

router.post('/login', async (req, res, next) => {
  const { role, phone, id } = req.body;
  
  if (!role || !phone || !id) {
    return res.status(400).json({ message: 'Role, phone number, and unique ID are required.' });
  }

  try {
    const cleanPhone = String(phone).trim();
    const cleanId = String(id).trim().toUpperCase();

    if (role === 'DOCTOR') {
      const doctor = await Doctor.findOne({
        phone: cleanPhone,
        doctorId: cleanId,
        status: 'ACTIVE'
      });

      if (!doctor) {
        return res.status(401).json({ message: 'Invalid credentials or doctor profile inactive.' });
      }

      return res.json({
        token: `mock-doctor-token:${doctor.doctorId}`,
        user: {
          id: doctor.doctorId,
          role: 'DOCTOR',
          name: doctor.name
        }
      });
    } else if (role === 'PATIENT') {
      // Allow patient to login even if their profile status is INACTIVE
      const patient = await Patient.findOne({
        phone: cleanPhone,
        patientId: cleanId
      });

      if (!patient) {
        return res.status(401).json({ message: 'Invalid credentials or patient profile not found.' });
      }

      return res.json({
        token: `mock-patient-token:${patient.patientId}`,
        user: {
          id: patient.patientId,
          role: 'PATIENT',
          name: patient.name,
          patientId: patient.patientId
        }
      });
    } else {
      return res.status(400).json({ message: 'Invalid role for credentials-based authentication.' });
    }
  } catch (err) {
    next(err);
  }
});

export default router;
