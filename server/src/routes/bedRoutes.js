import express from 'express';
import * as bedController from '../controllers/bedController.js';

const router = express.Router();

router.get('/', bedController.getBeds);
router.post('/', bedController.addBed);
router.delete('/:bedId', bedController.removeBed);
router.put('/:bedId/assign', bedController.assignBed);
router.put('/:bedId/clean', bedController.cleanBed);
router.put('/:bedId/status', bedController.updateBedStatus);

export default router;
