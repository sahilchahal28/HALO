import express from 'express';
import * as notificationController from '../controllers/notificationController.js';

const router = express.Router();

router.get('/:doctorId', notificationController.getDoctorNotifications);
router.put('/:notificationId/status', notificationController.updateNotificationStatus);

export default router;
