import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateRetentionPolicy } from '../src/services/documentService.js';
import { RETENTION_ELIGIBLE_TYPES } from '../src/models/MedicalDocument.js';

describe('Medical Record Retention Policy & Eligibility Tests', () => {
  test('Diagnostic reports and tests automatically receive 6-month retention policy', () => {
    assert.deepStrictEqual(RETENTION_ELIGIBLE_TYPES, ['LAB_REPORT', 'IMAGING', 'TEST_REPORT']);

    const examDate = new Date('2026-01-01T00:00:00Z');
    const policy = calculateRetentionPolicy('LAB_REPORT', examDate);

    assert.strictEqual(policy.policyType, 'SIX_MONTHS_AUTO_DELETE');
    assert.strictEqual(policy.autoDelete, true);
    assert.strictEqual(policy.retentionDays, 180);
    assert.ok(policy.expiresAt);

    // 180 days = 180 * 24 * 60 * 60 * 1000 ms
    const expectedExpiry = new Date(examDate.getTime() + 180 * 24 * 60 * 60 * 1000);
    assert.strictEqual(policy.expiresAt.toISOString(), expectedExpiry.toISOString());
  });

  test('Imaging scans receive 6-month retention policy', () => {
    const examDate = new Date('2026-05-15T10:00:00Z');
    const policy = calculateRetentionPolicy('IMAGING', examDate);

    assert.strictEqual(policy.policyType, 'SIX_MONTHS_AUTO_DELETE');
    assert.strictEqual(policy.autoDelete, true);
    assert.strictEqual(policy.retentionDays, 180);
    assert.ok(policy.expiresAt > examDate);
  });

  test('Prescriptions and discharge summaries are preserved PERMANENTLY (no auto-deletion)', () => {
    const rxPolicy = calculateRetentionPolicy('PRESCRIPTION');
    assert.strictEqual(rxPolicy.policyType, 'PERMANENT');
    assert.strictEqual(rxPolicy.autoDelete, false);
    assert.strictEqual(rxPolicy.expiresAt, null);

    const dsPolicy = calculateRetentionPolicy('DISCHARGE_SUMMARY');
    assert.strictEqual(dsPolicy.policyType, 'PERMANENT');
    assert.strictEqual(dsPolicy.autoDelete, false);
    assert.strictEqual(dsPolicy.expiresAt, null);

    const refPolicy = calculateRetentionPolicy('REFERRAL');
    assert.strictEqual(refPolicy.policyType, 'PERMANENT');
    assert.strictEqual(refPolicy.autoDelete, false);
    assert.strictEqual(refPolicy.expiresAt, null);
  });

  test('Retention worker eligibility criteria simulation', () => {
    const now = new Date('2026-10-12T12:00:00Z');

    // Document 1: Lab report created 7 months ago (expired)
    const oldLabReport = {
      status: 'ACTIVE',
      legalHold: false,
      retentionPolicy: {
        autoDelete: true,
        expiresAt: new Date('2026-09-01T00:00:00Z'), // in the past
      },
    };

    // Document 2: Prescription created 7 months ago (permanent)
    const oldPrescription = {
      status: 'ACTIVE',
      legalHold: false,
      retentionPolicy: {
        autoDelete: false,
        expiresAt: null,
      },
    };

    // Document 3: Lab report created 7 months ago but under legal hold
    const heldLabReport = {
      status: 'ACTIVE',
      legalHold: true,
      retentionPolicy: {
        autoDelete: true,
        expiresAt: new Date('2026-09-01T00:00:00Z'),
      },
    };

    const isEligibleForAutoPurge = (doc) =>
      doc.status === 'ACTIVE' &&
      !doc.legalHold &&
      doc.retentionPolicy.autoDelete === true &&
      doc.retentionPolicy.expiresAt <= now;

    assert.strictEqual(isEligibleForAutoPurge(oldLabReport), true);
    assert.strictEqual(isEligibleForAutoPurge(oldPrescription), false);
    assert.strictEqual(isEligibleForAutoPurge(heldLabReport), false);
  });
});
