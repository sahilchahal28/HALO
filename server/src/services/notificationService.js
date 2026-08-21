import Notification from '../models/Notification.js';

export async function getDoctorNotifications(doctorId) {
  return await Notification.find({
    recipientId: doctorId,
    status: { $ne: 'ARCHIVED' }
  }).sort({ createdAt: -1 });
}

export async function updateNotificationStatus(notificationId, status) {
  const notif = await Notification.findOne({ notificationId });
  if (!notif) throw new Error('Notification record not found');
  
  notif.status = status;
  if (status === 'READ') notif.readAt = new Date();
  if (status === 'ARCHIVED') notif.archivedAt = new Date();
  
  await notif.save();
  return notif;
}
