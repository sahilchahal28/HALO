import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('Document Authorization and Patient-Only Deletion Enforcement', () => {
  // Authorization verification rules
  function verifyViewPermission(actor, actorRole, targetPatientId) {
    if (actorRole === 'PATIENT') {
      const allowedId = actor.patientId || actor.id;
      if (targetPatientId !== allowedId) {
        throw new Error('Unauthorized: Patients can only view their own documents.');
      }
    }
    return true;
  }

  function verifyDeletePermission(actor, actorRole, document) {
    // STRICT RULE: Only the patient can delete their medical record!
    if (actorRole !== 'PATIENT') {
      const err = new Error('Forbidden: Medical records can only be removed by the patient.');
      err.status = 403;
      throw err;
    }

    const allowedId = actor.patientId || actor.id;
    if (document.patientId !== allowedId) {
      const err = new Error('Forbidden: You can only delete your own medical records.');
      err.status = 403;
      throw err;
    }

    if (document.legalHold) {
      const err = new Error('Cannot delete document: An active legal/medical hold is in place.');
      err.status = 400;
      throw err;
    }

    return true;
  }

  test('Patient can view their own documents', () => {
    const patientUser = { id: 'HALO-PAT-1001', patientId: 'HALO-PAT-1001', role: 'PATIENT' };
    assert.strictEqual(verifyViewPermission(patientUser, 'PATIENT', 'HALO-PAT-1001'), true);
  });

  test('Patient CANNOT view another patient documents', () => {
    const patientUser = { id: 'HALO-PAT-1001', patientId: 'HALO-PAT-1001', role: 'PATIENT' };
    assert.throws(
      () => verifyViewPermission(patientUser, 'PATIENT', 'HALO-PAT-9999'),
      /Patients can only view their own documents/
    );
  });

  test('Doctor and Admin can view patient documents', () => {
    const doctorUser = { id: 'HALO-DOC-7675', role: 'DOCTOR' };
    const adminUser = { id: 'admin', role: 'ADMIN' };
    assert.strictEqual(verifyViewPermission(doctorUser, 'DOCTOR', 'HALO-PAT-1001'), true);
    assert.strictEqual(verifyViewPermission(adminUser, 'ADMIN', 'HALO-PAT-1001'), true);
  });

  test('Patient CAN delete their own document', () => {
    const patientUser = { id: 'HALO-PAT-1001', patientId: 'HALO-PAT-1001', role: 'PATIENT' };
    const doc = { documentId: 'DOC-10001', patientId: 'HALO-PAT-1001', legalHold: false };
    assert.strictEqual(verifyDeletePermission(patientUser, 'PATIENT', doc), true);
  });

  test('Patient CANNOT delete another patient document', () => {
    const patientUser = { id: 'HALO-PAT-1001', patientId: 'HALO-PAT-1001', role: 'PATIENT' };
    const doc = { documentId: 'DOC-10002', patientId: 'HALO-PAT-2002', legalHold: false };
    assert.throws(
      () => verifyDeletePermission(patientUser, 'PATIENT', doc),
      /You can only delete your own medical records/
    );
  });

  test('Doctor is STRICTLY FORBIDDEN from deleting patient records', () => {
    const doctorUser = { id: 'HALO-DOC-7675', role: 'DOCTOR' };
    const doc = { documentId: 'DOC-10001', patientId: 'HALO-PAT-1001', legalHold: false };
    assert.throws(
      () => verifyDeletePermission(doctorUser, 'DOCTOR', doc),
      /Medical records can only be removed by the patient/
    );
  });

  test('Admin is STRICTLY FORBIDDEN from deleting patient records', () => {
    const adminUser = { id: 'admin', role: 'ADMIN' };
    const doc = { documentId: 'DOC-10001', patientId: 'HALO-PAT-1001', legalHold: false };
    assert.throws(
      () => verifyDeletePermission(adminUser, 'ADMIN', doc),
      /Medical records can only be removed by the patient/
    );
  });

  test('Active legal hold prevents document deletion even by patient', () => {
    const patientUser = { id: 'HALO-PAT-1001', patientId: 'HALO-PAT-1001', role: 'PATIENT' };
    const doc = { documentId: 'DOC-10001', patientId: 'HALO-PAT-1001', legalHold: true };
    assert.throws(
      () => verifyDeletePermission(patientUser, 'PATIENT', doc),
      /An active legal\/medical hold is in place/
    );
  });
});
