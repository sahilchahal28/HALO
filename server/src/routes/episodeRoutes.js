import express from 'express';
import * as episodeController from '../controllers/episodeController.js';

const router = express.Router();

router.get('/', episodeController.getEpisodes);
router.post('/', episodeController.createEpisode);
router.put('/:episodeId', episodeController.updateEpisode);
router.post('/:episodeId/discharge', episodeController.dischargePatient);

export default router;
