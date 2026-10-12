import express from 'express';
import * as surgeryController from '../controllers/surgeryController.js';

const router = express.Router();

router.get('/', surgeryController.getSurgeries);
router.post('/', surgeryController.bookSurgery);
router.patch('/:surgeryId/status', surgeryController.updateSurgeryStatus);
router.put('/:surgeryId', surgeryController.updateSurgeryStatus);

export default router;
