import * as notificationService from '../services/notificationService.js';

export async function getDoctorNotifications(req, res, next) {
  try {
    const { doctorId } = req.params;
    const list = await notificationService.getDoctorNotifications(doctorId);
    res.json(list);
  } catch (err) {
    next(err);
  }
}

export async function updateNotificationStatus(req, res, next) {
  try {
    const { notificationId } = req.params;
    const { status } = req.body;
    const updated = await notificationService.updateNotificationStatus(notificationId, status);
    res.json(updated);
  } catch (err) {
    next(err);
  }
}
