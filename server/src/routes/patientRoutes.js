import express from 'express';
import * as patientController from '../controllers/patientController.js';

const router = express.Router();

router.get('/', patientController.getPatients);
router.post('/register', patientController.registerPatient);
router.get('/lookup', patientController.lookupPatient);
router.get('/:patientId', patientController.getPatientById);
router.put('/:patientId', patientController.updatePatient);
router.put('/:patientId/assign-doctor', patientController.assignDoctor);
router.post('/:patientId/admit', patientController.admitPatient);
router.get('/:patientId/documents', patientController.getPatientDocuments);
router.post('/:patientId/documents', patientController.addPatientDocument);
router.delete('/:patientId', patientController.deletePatient);

export default router;
