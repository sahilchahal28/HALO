import express from 'express';
import * as bloodController from '../controllers/bloodController.js';

const router = express.Router();

router.get('/', bloodController.getBloodInventory);
router.get('/donors/:bloodGroup', bloodController.getEligibleDonors);
router.post('/request', bloodController.createRequirement);
router.put('/stock', bloodController.updateBloodStock);
router.get('/donors-list', bloodController.getAllDonors);
router.post('/donors-list', bloodController.createDonor);
router.delete('/donors-list/:donorId', bloodController.deleteDonor);

export default router;
