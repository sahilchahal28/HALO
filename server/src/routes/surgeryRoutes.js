import express from 'express';
import * as surgeryController from '../controllers/surgeryController.js';

const router = express.Router();

router.get('/', surgeryController.getSurgeries);
router.post('/', surgeryController.bookSurgery);

export default router;
