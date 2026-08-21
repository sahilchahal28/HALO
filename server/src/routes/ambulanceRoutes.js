import express from 'express';
import * as ambulanceController from '../controllers/ambulanceController.js';

const router = express.Router();

router.get('/', ambulanceController.getAmbulanceRequests);
router.post('/request', ambulanceController.createAmbulanceRequest);
router.put('/:requestId/status', ambulanceController.updateAmbulanceStatus);

router.get('/vehicles', ambulanceController.getAmbulanceVehicles);
router.post('/vehicles', ambulanceController.addAmbulanceVehicle);
router.delete('/vehicles/:ambulanceId', ambulanceController.removeAmbulanceVehicle);

export default router;
