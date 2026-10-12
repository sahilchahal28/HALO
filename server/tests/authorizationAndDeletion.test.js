import { test, describe } from 'node:test';
import assert from 'node:assert';
import { canAccessPatient, assertPatientAccess, getDeletePermissionError } from '../src/services/accessControl.js';
import { isAllowedMimeType, fileExtensionFor } from '../src/utils/mimeTypes.js';

describe('Document Access Control — assignment-enforced', () => {
  const patientA = { patientId: 'HALO-PAT-1001', assignedDoctor: { doctorId: 'HALO-DOC-AI-8888' } };
  const patientB = { patientId: 'HALO-PAT-9999', assignedDoctor: { doctorId: 'HALO-DOC-XYZ' } };
  const patientUnassigned = { patientId: 'HALO-PAT-2001', assignedDoctor: null };

  test('ADMIN can access every patient (no assignment check)', () => {
    const admin = { id: 'admin', role: 'ADMIN', name: 'Sarah Jenkins (Admin)' };
    assert.strictEqual(canAccessPatient({ actor: admin, patient: patientA, assignedDoctor: null }), true);
    assert.strictEqual(canAccessPatient({ actor: admin, patient: patientB, assignedDoctor: null }), true);
  });

  test('PATIENT can access own records only (case-insensitive)', () => {
    const own = { id: 'HALO-PAT-1001', patientId: 'HALO-PAT-1001', role: 'PATIENT' };
    const ownLower = { id: 'halo-pat-1001', role: 'PATIENT' };
    assert.strictEqual(canAccessPatient({ actor: own, patient: patientA, assignedDoctor: null }), true);
    assert.strictEqual(canAccessPatient({ actor: ownLower, patient: patientA, assignedDoctor: null }), true);
    assert.strictEqual(canAccessPatient({ actor: own, patient: patientB, assignedDoctor: null }), false);
  });

  test('PATIENT without patientId claim is rejected for every patient', () => {
    const rogue = { id: 'HALO-PAT-9999', role: 'PATIENT' };
    assert.strictEqual(canAccessPatient({ actor: rogue, patient: patientA, assignedDoctor: null }), false);
  });

  test('DOCTOR can access ONLY the patient they are assigned to', () => {
    const assignedDoctor = { id: 'HALO-DOC-AI-8888', role: 'DOCTOR' };
    const unassignedDoctor = { id: 'HALO-DOC-XYZ', role: 'DOCTOR' };

    // Assigned doctor — sees their patient
    assert.strictEqual(
      canAccessPatient({ actor: assignedDoctor, patient: patientA, assignedDoctor: patientA.assignedDoctor }),
      true
    );
    // Same doctor — cannot see a different patient
    assert.strictEqual(
      canAccessPatient({ actor: assignedDoctor, patient: patientB, assignedDoctor: patientB.assignedDoctor }),
      false
    );
    // Same doctor — cannot see a patient with no assigned doctor
    assert.strictEqual(
      canAccessPatient({ actor: assignedDoctor, patient: patientUnassigned, assignedDoctor: null }),
      false
    );
    // Unassigned doctor — cannot see either patient
    assert.strictEqual(
      canAccessPatient({ actor: unassignedDoctor, patient: patientA, assignedDoctor: patientA.assignedDoctor }),
      false
    );
  });

  test('Unauthenticated / unknown-role actor is rejected', () => {
    assert.strictEqual(canAccessPatient({ actor: null, patient: patientA, assignedDoctor: null }), false);
    assert.strictEqual(canAccessPatient({ actor: {}, patient: patientA, assignedDoctor: null }), false);
    assert.strictEqual(canAccessPatient({ actor: { id: 'x', role: 'HACKER' }, patient: patientA, assignedDoctor: null }), false);
    assert.strictEqual(canAccessPatient({ actor: { id: 'x', role: 'DOCTOR' }, patient: null, assignedDoctor: null }), false);
  });
});

describe('Document Deletion — patient-only, enforced at helper level', () => {
  test('PATIENT CAN delete own document (no hold)', () => {
    const actor = { id: 'HALO-PAT-1001', patientId: 'HALO-PAT-1001', role: 'PATIENT' };
    const doc = { documentId: 'DOC-10001', patientId: 'HALO-PAT-1001', legalHold: false };
    assert.strictEqual(getDeletePermissionError(actor, 'PATIENT', doc), null);
  });

  test('PATIENT CANNOT delete another patient document', () => {
    const actor = { id: 'HALO-PAT-1001', patientId: 'HALO-PAT-1001', role: 'PATIENT' };
    const doc = { documentId: 'DOC-10002', patientId: 'HALO-PAT-2002', legalHold: false };
    assert.strictEqual(getDeletePermissionError(actor, 'PATIENT', doc), 'Forbidden: You can only delete your own medical records.');
  });

  test('DOCTOR is STRICTLY FORBIDDEN from deleting patient records', () => {
    const actor = { id: 'HALO-DOC-7675', role: 'DOCTOR' };
    const doc = { documentId: 'DOC-10001', patientId: 'HALO-PAT-1001', legalHold: false };
    assert.strictEqual(getDeletePermissionError(actor, 'DOCTOR', doc), 'Forbidden: Medical records can only be removed by the patient.');
  });

  test('ADMIN is STRICTLY FORBIDDEN from deleting patient records (patient-only deletion rule)', () => {
    const actor = { id: 'admin', role: 'ADMIN' };
    const doc = { documentId: 'DOC-10001', patientId: 'HALO-PAT-1001', legalHold: false };
    assert.strictEqual(getDeletePermissionError(actor, 'ADMIN', doc), 'Forbidden: Medical records can only be removed by the patient.');
  });

  test('Active legal hold blocks deletion even by the owning patient', () => {
    const actor = { id: 'HALO-PAT-1001', patientId: 'HALO-PAT-1001', role: 'PATIENT' };
    const doc = { documentId: 'DOC-10001', patientId: 'HALO-PAT-1001', legalHold: true };
    assert.strictEqual(getDeletePermissionError(actor, 'PATIENT', doc), 'Cannot delete document: An active legal/medical hold is in place.');
  });
});

describe('File-type utilities', () => {
  test('isAllowedMimeType accepts PDF and any image, rejects SVG and others', () => {
    assert.strictEqual(isAllowedMimeType('application/pdf'), true);
    assert.strictEqual(isAllowedMimeType('image/jpeg'), true);
    assert.strictEqual(isAllowedMimeType('image/png'), true);
    assert.strictEqual(isAllowedMimeType('image/heic'), true);
    assert.strictEqual(isAllowedMimeType('image/heif'), true);
    assert.strictEqual(isAllowedMimeType('image/webp'), true);
    assert.strictEqual(isAllowedMimeType('image/avif'), true);
    assert.strictEqual(isAllowedMimeType('image/gif'), true);
    assert.strictEqual(isAllowedMimeType('image/tiff'), true);
    assert.strictEqual(isAllowedMimeType('image/bmp'), true);
    assert.strictEqual(isAllowedMimeType('image/svg+xml'), false);
    assert.strictEqual(isAllowedMimeType('text/html'), false);
    assert.strictEqual(isAllowedMimeType('application/x-msdownload'), false);
    assert.strictEqual(isAllowedMimeType(null), false);
    assert.strictEqual(isAllowedMimeType(''), false);
  });

  test('fileExtensionFor maps mime types to filesystem extensions', () => {
    assert.strictEqual(fileExtensionFor('application/pdf', ''), 'pdf');
    assert.strictEqual(fileExtensionFor('image/jpeg', ''), 'jpg');
    assert.strictEqual(fileExtensionFor('image/jpg', ''), 'jpg');
    assert.strictEqual(fileExtensionFor('image/png', ''), 'png');
    assert.strictEqual(fileExtensionFor('image/heic', ''), 'heic');
    assert.strictEqual(fileExtensionFor('image/webp', ''), 'webp');
    assert.strictEqual(fileExtensionFor('image/avif', ''), 'avif');
    assert.strictEqual(fileExtensionFor('image/bmp', 'photo.HEIC'), 'bmp');
    assert.strictEqual(fileExtensionFor('image/png', 'My.Picture.png'), 'png');
  });
});
