/**
 * accessControl.js
 *
 * Centralized patient-record authorization.
 *
 * Rules (strict):
 *   ADMIN   — unrestricted access to every patient's records.
 *   PATIENT — own records only (matched case-insensitively on patientId).
 *   DOCTOR  — ONLY patients whose `assignedDoctor` resolves to this
 *             doctor. Episode membership or prior uploads do NOT
 *             grant access — assignment is the single source of truth.
 *
 * Every document-related route funnels through these helpers so a
 * doctor can only view/submit records for patients assigned to them,
 * and a patient can only ever see their own.
 */
import Patient from '../models/Patient.js';

function normalize(id) {
  return String(id || '').trim().toUpperCase();
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Pure access decision (unit-testable, no database).
 *
 * @param {object} actor            { id, role, patientId? } — req.user shape
 * @param {object} patient          patient record (must expose patientId)
 * @param {object|null} assignedDoctor  populated Doctor doc for patient.assignedDoctor
 */
export function canAccessPatient({ actor, patient, assignedDoctor = null }) {
  if (!actor || !patient) return false;

  switch (actor.role) {
    case 'ADMIN':
      return true;

    case 'PATIENT': {
      const target = normalize(patient.patientId);
      return Boolean(
        (actor.patientId || actor.id) &&
        (normalize(actor.patientId) === target || normalize(actor.id) === target)
      );
    }

    case 'DOCTOR':
      if (!assignedDoctor) return false;
      return normalize(assignedDoctor.doctorId) === normalize(actor.id);

    default:
      return false;
  }
}

/**
 * Database-backed guard for route handlers and services.
 * Loads the patient (unless pre-loaded), resolves the assigned doctor,
 * and either resolves with the patient document or throws
 * a 401 / 403 / 404 error.
 *
 * @param {object} actor    req.user-shaped { id, role, name, patientId? }
 * @param {string} patientId
 * @param {object} [options]
 * @param {import('mongoose').Document} [options.patient] pre-loaded patient record
 */
export async function assertPatientAccess(actor, patientId, { patient: preloaded } = {}) {
  if (!actor) throw httpError(401, 'Authentication required.');

  const patient =
    preloaded ??
    (await Patient.findOne({
      patientId: new RegExp(`^${escapeRegExp(String(patientId))}$`, 'i'),
    }));

  if (!patient) throw httpError(404, `Patient not found: ${patientId}`);

  let assignedDoctor = patient.assignedDoctor;

  if (actor.role === 'DOCTOR') {
    // ObjectId (unpopulated) has no doctorId property — populate when needed
    if (assignedDoctor && typeof assignedDoctor.doctorId === 'undefined') {
      await patient.populate('assignedDoctor');
      assignedDoctor = patient.assignedDoctor;
    }
    if (!assignedDoctor) {
      throw httpError(403, 'Forbidden: This patient has no doctor assigned.');
    }
  }

  if (canAccessPatient({ actor, patient, assignedDoctor })) {
    return patient;
  }

  if (actor.role === 'PATIENT') {
    throw httpError(403, 'Unauthorized: You can only access your own medical records.');
  }
  throw httpError(403, 'Forbidden: You are not the assigned doctor for this patient.');
}

/**
 * Deletion authority — returns a human-readable error message when the
 * actor may NOT delete the document, or null when deletion is permitted.
 *
 * STRICT RULE: only the owning patient may delete a record.
 * Doctors and Admins are explicitly forbidden. Legal hold blocks everyone.
 */
export function getDeletePermissionError(actor, actorRole, document) {
  if (actorRole !== 'PATIENT') {
    return 'Forbidden: Medical records can only be removed by the patient.';
  }
  const allowedId = actor.patientId || actor.id;
  if (!document || normalize(document.patientId) !== normalize(allowedId)) {
    return 'Forbidden: You can only delete your own medical records.';
  }
  if (document.legalHold) {
    return 'Cannot delete document: An active legal/medical hold is in place.';
  }
  return null;
}
