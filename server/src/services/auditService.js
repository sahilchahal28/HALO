import AuditLog from '../models/AuditLog.js';

export async function logAction({ actor, action, entityType, entityId, metadata }) {
  try {
    await AuditLog.create({
      actor: actor || 'system',
      action,
      entityType,
      entityId,
      metadata
    });
    console.log(`[Audit Logged] Actor: ${actor || 'system'} | Action: ${action} | Entity: ${entityType}:${entityId}`);
  } catch (err) {
    console.error('Failed to log audit action:', err.message);
  }
}
