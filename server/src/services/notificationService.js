import Notification from '../models/Notification.js';

export async function getDoctorNotifications(doctorId) {
  const isTargetAdmin = String(doctorId || '').toLowerCase() === 'admin';
  const notifications = await Notification.find({
    $or: [
      { recipientId: doctorId },
      ...(isTargetAdmin ? [{ recipientType: 'ADMIN' }, { recipientId: 'ADMIN' }] : [])
    ],
    status: { $ne: 'ARCHIVED' }
  }).sort({ createdAt: -1 });

  // Suppress and archive any surgery notifications for surgeries that are cancelled, completed, or no longer exist
  const Surgery = (await import('../models/Surgery.js')).default;
  const filtered = [];
  for (const n of notifications) {
    if (n.type === 'SURGERY_SCHEDULED' || n.relatedEntity === 'Surgery') {
      const surgery = await Surgery.findOne({ surgeryId: n.relatedEntityId });
      if (!surgery || surgery.status === 'CANCELLED' || surgery.status === 'COMPLETED') {
        await Notification.updateOne({ _id: n._id }, { $set: { status: 'ARCHIVED', archivedAt: new Date() } });
        continue;
      }
    }
    filtered.push(n);
  }
  return filtered;
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
