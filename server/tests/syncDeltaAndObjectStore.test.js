import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateRetentionPolicy } from '../src/services/documentService.js';
import { canAccessPatient, getDeletePermissionError } from '../src/services/accessControl.js';

describe('HALO Object Store & PWA Archive Architecture', () => {
  it('enforces patient isolation for sync delta and document access', () => {
    const patientUser = { id: 'PAT-001', role: 'PATIENT', patientId: 'PAT-001' };
    const otherPatientUser = { id: 'PAT-002', role: 'PATIENT', patientId: 'PAT-002' };
    const patientDoc = { patientId: 'PAT-001' };

    // Owning patient can access
    assert.equal(canAccessPatient({ actor: patientUser, patient: patientDoc }), true);

    // Other patient is blocked
    assert.equal(canAccessPatient({ actor: otherPatientUser, patient: patientDoc }), false);
  });

  it('guarantees sole deletion authority for patients', () => {
    const doctorUser = { id: 'DOC-001', role: 'DOCTOR' };
    const adminUser = { id: 'admin', role: 'ADMIN' };
    const patientUser = { id: 'PAT-001', role: 'PATIENT', patientId: 'PAT-001' };
    const doc = { patientId: 'PAT-001', s3Key: 'records/PAT-001/file.pdf' };

    // Patient can delete own record
    assert.equal(getDeletePermissionError(patientUser, 'PATIENT', doc), null);

    // Doctor is forbidden
    assert.match(getDeletePermissionError(doctorUser, 'DOCTOR', doc), /only be removed by the patient/);

    // Admin is forbidden
    assert.match(getDeletePermissionError(adminUser, 'ADMIN', doc), /only be removed by the patient/);
  });

  it('correctly calculates 6-month retention for lab/imaging and permanent for rx', () => {
    const now = new Date();
    const labPolicy = calculateRetentionPolicy('LAB_REPORT', now);
    assert.equal(labPolicy.autoDelete, true);
    assert.equal(labPolicy.retentionDays, 180);
    assert.ok(labPolicy.expiresAt > now);

    const imagingPolicy = calculateRetentionPolicy('IMAGING', now);
    assert.equal(imagingPolicy.autoDelete, true);
    assert.equal(imagingPolicy.retentionDays, 180);

    const testPolicy = calculateRetentionPolicy('TEST_REPORT', now);
    assert.equal(testPolicy.autoDelete, true);

    const rxPolicy = calculateRetentionPolicy('PRESCRIPTION', now);
    assert.equal(rxPolicy.autoDelete, false);
    assert.equal(rxPolicy.expiresAt, null);

    const dischargePolicy = calculateRetentionPolicy('DISCHARGE_SUMMARY', now);
    assert.equal(dischargePolicy.autoDelete, false);
    assert.equal(dischargePolicy.expiresAt, null);
  });
});
