import * as patientService from '../services/patientService.js';
import { validatePatientRegister } from '../validators/patientValidator.js';

export async function getPatients(req, res, next) {
  try {
    const list = await patientService.getPatients();
    res.json(list);
  } catch (err) {
    next(err);
  }
}

export async function registerPatient(req, res, next) {
  try {
    validatePatientRegister(req.body);
    const actor = req.user ? req.user.id : 'admin';
    const patient = await patientService.registerPatient(req.body, actor);
    res.status(201).json(patient);
  } catch (err) {
    next(err);
  }
}

export async function lookupPatient(req, res, next) {
  try {
    const { token, patientId } = req.query;
    if (!token && !patientId) {
      return res.status(400).json({ message: 'Provide either token or patientId query parameter.' });
    }
    const patient = await patientService.lookupPatient({ token, patientId });
    if (!patient) {
      return res.status(404).json({ message: 'Patient record not found.' });
    }
    res.json(patient);
  } catch (err) {
    next(err);
  }
}

export async function getPatientById(req, res, next) {
  try {
    const { patientId } = req.params;
    const patient = await patientService.getPatientById(patientId);
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }
    res.json(patient);
  } catch (err) {
    next(err);
  }
}

export async function updatePatient(req, res, next) {
  try {
    const { patientId } = req.params;
    const actor = req.user ? req.user.id : 'admin';
    const patient = await patientService.updatePatient(patientId, req.body, actor);
    res.json(patient);
  } catch (err) {
    next(err);
  }
}

export async function assignDoctor(req, res, next) {
  try {
    const { patientId } = req.params;
    const { doctorId } = req.body;
    const actor = req.user ? req.user.id : 'admin';
    const patient = await patientService.assignDoctor(patientId, doctorId, actor);
    res.json(patient);
  } catch (err) {
    next(err);
  }
}

export async function admitPatient(req, res, next) {
  try {
    const { patientId } = req.params;
    const { department, doctorId, reason } = req.body;
    const actor = req.user ? req.user.id : 'admin';
    const patient = await patientService.admitPatient({ patientId, department, doctorId, reason }, actor);
    res.json(patient);
  } catch (err) {
    next(err);
  }
}

export async function getPatientDocuments(req, res, next) {
  try {
    const { patientId } = req.params;
    const list = await patientService.getPatientDocuments(patientId);
    res.json(list);
  } catch (err) {
    next(err);
  }
}

export async function addPatientDocument(req, res, next) {
  try {
    const { patientId } = req.params;
    const actor = req.user ? req.user.id : 'admin';
    const document = await patientService.addPatientDocument(patientId, req.body, actor);
    res.status(201).json(document);
  } catch (err) {
    next(err);
  }
}

export async function deletePatient(req, res, next) {
  try {
    const { patientId } = req.params;
    const actor = req.user ? req.user.id : 'admin';
    const result = await patientService.deletePatient(patientId, actor);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
