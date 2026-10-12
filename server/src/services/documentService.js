import crypto from 'crypto';
import MedicalDocument, {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  RETENTION_ELIGIBLE_TYPES,
} from '../models/MedicalDocument.js';
import Patient from '../models/Patient.js';
import TreatmentEpisode from '../models/TreatmentEpisode.js';
import { logAction } from './auditService.js';
import {
  generatePresignedUploadUrl,
  generatePresignedDownloadUrl,
  checkS3ObjectExists,
  deleteS3Object,
  putS3Object,
  putS3ObjectMultipart,
  isTransientS3Error,
  BUCKET_NAME,
} from '../config/s3.js';

/**
 * Calculate retention policy based on document type and examination date.
 * Rule: Reports and tests older than 6 months (180 days) are scheduled for auto-deletion.
 * Prescriptions, discharge summaries, and referrals are preserved permanently.
 */
export function calculateRetentionPolicy(type, examinationDate = new Date()) {
  const isEligible = RETENTION_ELIGIBLE_TYPES.includes(type);
  const examDate = new Date(examinationDate);

  if (isEligible) {
    const expiresAt = new Date(examDate.getTime() + 180 * 24 * 60 * 60 * 1000);
    return {
      policyType: 'SIX_MONTHS_AUTO_DELETE',
      autoDelete: true,
      retentionDays: 180,
      expiresAt,
    };
  }

  return {
    policyType: 'PERMANENT',
    autoDelete: false,
    retentionDays: 0,
    expiresAt: null,
  };
}

/**
 * 1. Initiate upload: Validates input, creates pending document, generates presigned upload URL.
 */
export async function initiateDocumentUpload({
  patientId,
  treatmentEpisodeId,
  type,
  title,
  mimeType,
  fileSize,
  department = 'GENERAL',
  doctor = null,
  doctorId = null,
  examinationDate = new Date(),
  actor,
  actorRole,
}) {
  // Input validations
  if (!patientId) {
    const err = new Error('patientId is required');
    err.status = 400;
    throw err;
  }

  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    const err = new Error(`Invalid file type: ${mimeType}. Allowed types: PDF, JPEG, PNG.`);
    err.status = 400;
    throw err;
  }

  if (!fileSize || fileSize <= 0 || fileSize > MAX_FILE_SIZE_BYTES) {
    const err = new Error(`File size must be between 1 byte and ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`);
    err.status = 400;
    throw err;
  }

  // Verify patient exists
  const patient = await Patient.findOne({ patientId });
  if (!patient) {
    const err = new Error('Patient not found');
    err.status = 404;
    throw err;
  }

  // Verify episode if provided
  if (treatmentEpisodeId) {
    const episode = await TreatmentEpisode.findOne({ episodeId: treatmentEpisodeId });
    if (!episode) {
      treatmentEpisodeId = null;
    }
  }

  // Authorization check for upload
  if (actorRole === 'PATIENT' && actor.id !== patientId && actor.patientId !== patientId) {
    const err = new Error('Unauthorized: Patients can only upload documents to their own record.');
    err.status = 403;
    throw err;
  }

  // Generate unique opaque S3 key
  const ext = mimeType === 'application/pdf' ? 'pdf' : mimeType === 'image/png' ? 'png' : 'jpg';
  const uniqueToken = crypto.randomUUID();
  const s3Key = `records/${patientId}/${Date.now()}-${uniqueToken}.${ext}`;

  // Generate sequential Document ID
  const count = await MedicalDocument.countDocuments();
  const documentId = `DOC-${10000 + count}`;

  const retentionPolicy = calculateRetentionPolicy(type, examinationDate);

  const document = new MedicalDocument({
    documentId,
    patientId,
    treatmentEpisodeId: treatmentEpisodeId || null,
    type,
    title: title || `Medical Record (${type})`,
    mimeType,
    fileSize,
    s3Key,
    s3Bucket: BUCKET_NAME,
    fileRef: s3Key,
    department: department || 'GENERAL',
    doctor: doctor || null,
    doctorId: doctorId || null,
    examinationDate: new Date(examinationDate),
    status: 'PENDING_UPLOAD',
    retentionPolicy,
    uploadedBy: actor.name || actor.id,
    uploadedByRole: actorRole,
  });

  await document.save();

  // Generate presigned upload URL
  const { uploadUrl, isMock } = await generatePresignedUploadUrl({
    key: s3Key,
    mimeType,
    contentLength: fileSize,
  });

  // Audit log upload initiation
  await logAction({
    actor: actor.name || actor.id,
    action: 'Document Upload Initiated',
    entityType: 'MedicalDocument',
    entityId: documentId,
    metadata: { patientId, type, title, s3Key, fileSize, isMock },
  });

  return {
    document,
    uploadUrl,
    isMock,
  };
}

/**
 * 1b. Direct multipart upload: Receives file buffer, validates, uploads directly to S3 / Cloudflare R2,
 * and saves active document metadata. Completely eliminates CORS and presigned URL routing issues.
 */
export async function directDocumentUpload({
  patientId,
  treatmentEpisodeId,
  type,
  title,
  file,
  department = 'GENERAL',
  doctor = null,
  doctorId = null,
  examinationDate = new Date(),
  actor,
  actorRole,
}) {
  if (!patientId) {
    const err = new Error('patientId is required');
    err.status = 400;
    throw err;
  }

  if (!file || !file.buffer) {
    const err = new Error('No file provided for upload');
    err.status = 400;
    throw err;
  }

  const mimeType = file.mimetype;
  const fileSize = file.size;

  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    const err = new Error(`Invalid file type: ${mimeType}. Allowed types: PDF, JPEG, PNG.`);
    err.status = 400;
    throw err;
  }

  if (fileSize > MAX_FILE_SIZE_BYTES) {
    const err = new Error(`File size exceeds maximum limit of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`);
    err.status = 400;
    throw err;
  }

  const patient = await Patient.findOne({ patientId });
  if (!patient) {
    const err = new Error('Patient not found');
    err.status = 404;
    throw err;
  }

  if (actorRole === 'PATIENT' && actor.id !== patientId && actor.patientId !== patientId) {
    const err = new Error('Unauthorized: Patients can only upload documents to their own record.');
    err.status = 403;
    throw err;
  }

  const ext = mimeType === 'application/pdf' ? 'pdf' : mimeType === 'image/png' ? 'png' : 'jpg';
  const uniqueToken = crypto.randomUUID();
  const s3Key = `records/${patientId}/${Date.now()}-${uniqueToken}.${ext}`;

  const count = await MedicalDocument.countDocuments();
  const documentId = `DOC-${10000 + count}`;
  const retentionPolicy = calculateRetentionPolicy(type, examinationDate);

  // Upload buffer to S3 / Cloudflare R2
  await putS3Object({
    key: s3Key,
    buffer: file.buffer,
    mimeType,
  });

  const document = new MedicalDocument({
    documentId,
    patientId,
    treatmentEpisodeId: treatmentEpisodeId || null,
    type,
    title: title || file.originalname || `Medical Record (${type})`,
    mimeType,
    fileSize,
    s3Key,
    s3Bucket: BUCKET_NAME,
    fileRef: s3Key,
    department: department || 'GENERAL',
    doctor: doctor || null,
    doctorId: doctorId || null,
    examinationDate: new Date(examinationDate),
    status: 'ACTIVE',
    retentionPolicy,
    uploadedBy: actor.name || actor.id,
    uploadedByRole: actorRole,
  });

  await document.save();

  await logAction({
    actor: actor.name || actor.id,
    action: 'Document Uploaded Directly',
    entityType: 'MedicalDocument',
    entityId: documentId,
    metadata: { patientId, type, title: document.title, s3Key, fileSize },
  });

  return document;
}

/**
 * 2. Confirm upload: Client notifies backend after successful upload to S3.
 */
export async function confirmDocumentUpload({ documentId, actor, actorRole }) {
  const document = await MedicalDocument.findOne({ documentId });
  if (!document) {
    const err = new Error('Document not found');
    err.status = 404;
    throw err;
  }

  // Authorization check
  if (actorRole === 'PATIENT' && actor.id !== document.patientId && actor.patientId !== document.patientId) {
    const err = new Error('Unauthorized: You can only confirm your own documents.');
    err.status = 403;
    throw err;
  }

  // Verify object existence in S3/R2 (or skip if mock)
  const head = await checkS3ObjectExists({ key: document.s3Key });
  if (!head.exists) {
    const err = new Error('Upload verification failed: file not found in storage bucket.');
    err.status = 400;
    throw err;
  }

  document.status = 'ACTIVE';
  await document.save();

  await logAction({
    actor: actor.name || actor.id,
    action: 'Document Upload Confirmed',
    entityType: 'MedicalDocument',
    entityId: documentId,
    metadata: { patientId: document.patientId, title: document.title, s3Key: document.s3Key },
  });

  return document;
}

/**
 * 3. List documents with filtering, authorization, and server-side pagination.
 */
export async function listDocuments({
  patientId,
  category,
  startDate,
  endDate,
  department,
  doctor,
  status,
  page = 1,
  limit = 20,
  actor,
  actorRole,
}) {
  // Authorization: Patients can ONLY list their own documents
  if (actorRole === 'PATIENT') {
    const allowedId = actor.patientId || actor.id;
    if (patientId && patientId !== allowedId) {
      const err = new Error('Unauthorized: Patients can only view their own documents.');
      err.status = 403;
      throw err;
    }
    patientId = allowedId;
  }

  const query = {};

  if (patientId) {
    query.patientId = patientId;
  }

  if (category) {
    query.type = category;
  }

  if (department) {
    query.department = department;
  }

  if (doctor) {
    query.$or = [{ doctor }, { doctorId: doctor }];
  }

  if (status) {
    query.status = status;
  } else {
    // By default exclude soft-deleted or abandoned uploads
    query.status = { $in: ['ACTIVE', 'ARCHIVED'] };
  }

  if (startDate || endDate) {
    query.examinationDate = {};
    if (startDate) query.examinationDate.$gte = new Date(startDate);
    if (endDate) query.examinationDate.$lte = new Date(endDate);
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [totalCount, documents] = await Promise.all([
    MedicalDocument.countDocuments(query),
    MedicalDocument.find(query).sort({ examinationDate: -1, createdAt: -1 }).skip(skip).limit(limitNum),
  ]);

  return {
    data: documents,
    pagination: {
      total: totalCount,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(totalCount / limitNum),
    },
  };
}

/**
 * 4. Generate signed download URL: short-lived, with authorization checks and audit logging.
 */
export async function getDocumentDownloadUrl({ documentId, actor, actorRole }) {
  const document = await MedicalDocument.findOne({ documentId });
  if (!document) {
    const err = new Error('Document not found');
    err.status = 404;
    throw err;
  }

  if (document.status === 'DELETED') {
    const err = new Error('Document has been permanently removed.');
    err.status = 410;
    throw err;
  }

  // Authorization check:
  // - Patient can only download their own document
  // - Doctor & Admin can download any patient document
  if (actorRole === 'PATIENT') {
    const allowedId = actor.patientId || actor.id;
    if (document.patientId !== allowedId) {
      const err = new Error('Unauthorized: You can only view and download your own medical records.');
      err.status = 403;
      throw err;
    }
  }

  const { downloadUrl, isMock } = await generatePresignedDownloadUrl({
    key: document.s3Key,
    filename: `${document.title}.${document.mimeType === 'application/pdf' ? 'pdf' : 'jpg'}`,
    expiresIn: 900, // 15 minutes
  });

  // Audit log download
  await logAction({
    actor: actor.name || actor.id,
    action: 'Document Downloaded',
    entityType: 'MedicalDocument',
    entityId: documentId,
    metadata: { patientId: document.patientId, title: document.title, s3Key: document.s3Key },
  });

  return {
    documentId: document.documentId,
    title: document.title,
    mimeType: document.mimeType,
    downloadUrl,
    expiresInSeconds: 900,
    isMock,
  };
}

/**
 * 5. Delete document:
 * STRICT RULE: Only the patient can delete their medical record!
 * Doctors and Admins are rejected.
 * Documents under legal hold cannot be deleted.
 */
export async function deleteDocument({ documentId, actor, actorRole }) {
  const document = await MedicalDocument.findOne({ documentId });
  if (!document) {
    const err = new Error('Document not found');
    err.status = 404;
    throw err;
  }

  // Strict Permission Check: ONLY the patient can delete their medical records!
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

  // Legal Hold Check
  if (document.legalHold) {
    const err = new Error('Cannot delete document: An active legal/medical hold is in place.');
    err.status = 400;
    throw err;
  }

  // Attempt S3 deletion
  let s3Deleted = false;
  try {
    const result = await deleteS3Object({ key: document.s3Key });
    s3Deleted = result.deleted;
  } catch (s3Err) {
    console.error(`[S3 Deletion Error] Failed to delete object ${document.s3Key}:`, s3Err.message);
    // Mark as DELETION_FAILED for worker to retry
    document.status = 'DELETION_FAILED';
    document.deletionRetryCount += 1;
    document.deletionError = s3Err.message;
    await document.save();

    await logAction({
      actor: actor.name || actor.id,
      action: 'Document Deletion S3 Failure',
      entityType: 'MedicalDocument',
      entityId: documentId,
      metadata: { error: s3Err.message, retryCount: document.deletionRetryCount },
    });

    const err = new Error('Storage service temporary error. Deletion queued for retry.');
    err.status = 502;
    throw err;
  }

  // If S3 deleted or mock deleted:
  document.status = 'DELETED';
  document.deletedAt = new Date();
  document.deletedBy = actor.name || actor.id;
  await document.save();

  await logAction({
    actor: actor.name || actor.id,
    action: 'Document Deleted by Patient',
    entityType: 'MedicalDocument',
    entityId: documentId,
    metadata: { patientId: document.patientId, title: document.title, s3Key: document.s3Key },
  });

  return { success: true, documentId, status: 'DELETED' };
}

/**
 * 6. Legal Hold Management (Doctor or Admin or Patient flag)
 */
export async function updateLegalHold({ documentId, legalHold, reason, actor, actorRole }) {
  const document = await MedicalDocument.findOne({ documentId });
  if (!document) {
    const err = new Error('Document not found');
    err.status = 404;
    throw err;
  }

  document.legalHold = Boolean(legalHold);
  document.legalHoldReason = legalHold ? reason || 'Clinical / Legal Hold requested' : null;
  document.legalHoldUpdatedAt = new Date();
  document.legalHoldUpdatedBy = actor.name || actor.id;

  await document.save();

  await logAction({
    actor: actor.name || actor.id,
    action: legalHold ? 'Legal Hold Placed' : 'Legal Hold Released',
    entityType: 'MedicalDocument',
    entityId: documentId,
    metadata: { legalHold, reason, updatedByRole: actorRole },
  });

  return document;
}

/**
 * 7. Scheduled Retention Deletion Worker:
 * Rule: Automatically delete diagnostic reports & tests older than 6 months (180 days).
 * Never delete records without an applicable retention policy or with legal hold active.
 * Retries failed deletions up to 5 times.
 */
export async function runRetentionDeletionWorker() {
  const now = new Date();
  const summary = {
    checked: 0,
    purged: 0,
    failed: 0,
    retried: 0,
  };

  // 1. Find ACTIVE documents past their expiration date that do not have legal hold
  const eligibleQuery = {
    status: 'ACTIVE',
    legalHold: { $ne: true },
    'retentionPolicy.autoDelete': true,
    'retentionPolicy.expiresAt': { $lte: now },
  };

  const expiredDocs = await MedicalDocument.find(eligibleQuery).limit(50);
  summary.checked += expiredDocs.length;

  for (const doc of expiredDocs) {
    try {
      await deleteS3Object({ key: doc.s3Key });
      doc.status = 'DELETED';
      doc.deletedAt = new Date();
      doc.deletedBy = 'SYSTEM_RETENTION_WORKER';
      await doc.save();
      summary.purged += 1;

      await logAction({
        actor: 'SYSTEM_RETENTION_WORKER',
        action: 'Document Auto-Purged by Retention Policy',
        entityType: 'MedicalDocument',
        entityId: doc.documentId,
        metadata: {
          patientId: doc.patientId,
          type: doc.type,
          title: doc.title,
          expiresAt: doc.retentionPolicy.expiresAt,
        },
      });
    } catch (err) {
      console.error(`[Retention Worker] Failed to purge doc ${doc.documentId}:`, err.message);
      doc.status = 'DELETION_FAILED';
      doc.deletionRetryCount += 1;
      doc.deletionError = err.message;
      await doc.save();
      summary.failed += 1;
    }
  }

  // 2. Retry documents in DELETION_FAILED status (up to 5 retries)
  const retryDocs = await MedicalDocument.find({
    status: 'DELETION_FAILED',
    legalHold: { $ne: true },
    deletionRetryCount: { $lt: 5 },
  }).limit(20);

  for (const doc of retryDocs) {
    summary.retried += 1;
    try {
      await deleteS3Object({ key: doc.s3Key });
      doc.status = 'DELETED';
      doc.deletedAt = new Date();
      doc.deletedBy = 'SYSTEM_RETENTION_RETRY_WORKER';
      await doc.save();
      summary.purged += 1;

      await logAction({
        actor: 'SYSTEM_RETENTION_RETRY_WORKER',
        action: 'Document Auto-Purge Retry Succeeded',
        entityType: 'MedicalDocument',
        entityId: doc.documentId,
        metadata: { patientId: doc.patientId, retryCount: doc.deletionRetryCount },
      });
    } catch (err) {
      doc.deletionRetryCount += 1;
      doc.deletionError = err.message;
      await doc.save();
      summary.failed += 1;
    }
  }

  return summary;
}
