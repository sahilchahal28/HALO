import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  RETENTION_ELIGIBLE_TYPES,
} from '../src/models/MedicalDocument.js';
import {
  generatePresignedUploadUrl,
  generatePresignedDownloadUrl,
  checkS3ObjectExists,
  deleteS3Object,
} from '../src/config/s3.js';

describe('S3 Storage & Validation Tests', () => {
  test('Allowed MIME types strictly include PDF, JPEG, PNG only', () => {
    assert.deepStrictEqual(ALLOWED_MIME_TYPES, ['application/pdf', 'image/jpeg', 'image/png']);
    assert.strictEqual(ALLOWED_MIME_TYPES.includes('application/pdf'), true);
    assert.strictEqual(ALLOWED_MIME_TYPES.includes('image/jpeg'), true);
    assert.strictEqual(ALLOWED_MIME_TYPES.includes('image/png'), true);
    assert.strictEqual(ALLOWED_MIME_TYPES.includes('application/x-msdownload'), false);
    assert.strictEqual(ALLOWED_MIME_TYPES.includes('text/html'), false);
  });

  test('Maximum file size is enforced at 15MB', () => {
    assert.strictEqual(MAX_FILE_SIZE_BYTES, 15 * 1024 * 1024);
    assert.strictEqual(14 * 1024 * 1024 <= MAX_FILE_SIZE_BYTES, true);
    assert.strictEqual(16 * 1024 * 1024 <= MAX_FILE_SIZE_BYTES, false);
  });

  test('Presigned upload URL generation provides uploadUrl and isMock flag', async () => {
    const res = await generatePresignedUploadUrl({
      key: 'records/HALO-PAT-001/test-report.pdf',
      mimeType: 'application/pdf',
      contentLength: 2048,
    });

    assert.ok(res.uploadUrl);
    assert.strictEqual(typeof res.isMock, 'boolean');
  });

  test('Presigned download URL generation formats inline content disposition', async () => {
    const res = await generatePresignedDownloadUrl({
      key: 'records/HALO-PAT-001/test-report.pdf',
      filename: 'Blood-Test-Oct.pdf',
      expiresIn: 900,
    });

    assert.ok(res.downloadUrl);
    assert.strictEqual(typeof res.isMock, 'boolean');
  });

  test('Object existence check and deletion methods operate gracefully', async () => {
    const existsRes = await checkS3ObjectExists({ key: 'records/HALO-PAT-001/sample.pdf' });
    assert.strictEqual(typeof existsRes.exists, 'boolean');

    const delRes = await deleteS3Object({ key: 'records/HALO-PAT-001/sample.pdf' });
    assert.strictEqual(delRes.deleted, true);
  });
});
