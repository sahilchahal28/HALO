/**
 * documentService.js
 *
 * Medical-record management service — backed by the LOCAL FILESYSTEM.
 * All S3 / Cloudflare R2 code has been removed.
 *
 * Storage layout (on this machine):
 *   server/storage/users/records/<patientId>/<timestamp>-<uuid>.<ext>
 *
 * Retention Rule (STRICT):
 *   LAB_REPORT, IMAGING, TEST_REPORT older than 6 months (180 days) → auto-deleted.
 *   PRESCRIPTION, DISCHARGE_SUMMARY, REFERRAL, OTHER                → PERMANENT.
 *
 * Delete Authority:
 *   ONLY the patient who owns the record may delete it.
 *   Doctors and Admins are explicitly forbidden from deleting.
 *
 * Network Sync:
 *   Uploads are committed to disk immediately.  When Wi-Fi is available
 *   the stubbed syncToRemoteIfOnline() can be wired to push files to a
 *   remote destination without changing this layer.
 */
import crypto from 'crypto';
import MedicalDocument, {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  RETENTION_ELIGIBLE_TYPES,
} from '../models/MedicalDocument.js';
import Patient from '../models/Patient.js';
import TreatmentEpisode from '../models/TreatmentEpisode.js';
import Doctor from '../models/Doctor.js';
import { logAction } from './auditService.js';
import {
  putLocalObject,
  deleteLocalObject,
  checkLocalObjectExists,
  buildLocalDownloadUrl,
  buildFileKey,
  syncToRemoteIfOnline,
  getLocalFilePath,
} from '../config/localStorage.js';

// ─── Retention Policy ────────────────────────────────────────────────────────

/**
 * Calculate retention policy based on document type and examination date.
 *
 * ⚠️  RULE: Reports and tests (LAB_REPORT, IMAGING, TEST_REPORT) older than
 *     6 months (180 days) from their examination date are automatically deleted.
 *     All other document types are kept PERMANENTLY.
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

// ─── Upload ──────────────────────────────────────────────────────────────────

/**
 * Direct multipart upload:
 *   Receives the file buffer from multer, validates it, writes it to the
 *   local storage directory, and saves metadata to MongoDB.
 *
 * NOTE: There is no longer a presigned-URL / two-step upload flow.
 *       Files go straight to disk in one request.
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
  // ── Basic validation ──
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
    const err = new Error(`File size exceeds maximum limit of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB.`);
    err.status = 400;
    throw err;
  }

  // ── Verify patient ──
  const patient = await Patient.findOne({ patientId: new RegExp(`^${patientId}$`, 'i') });
  if (!patient) {
    const err = new Error(`Patient not found: ${patientId}`);
    err.status = 404;
    throw err;
  }

  // ── Resolve episode ──
  if (treatmentEpisodeId) {
    const episode = await TreatmentEpisode.findOne({ episodeId: treatmentEpisodeId });
    if (!episode) treatmentEpisodeId = null;
  }

  // ── Resolve doctor ──
  let resolvedDoctorId = doctorId;
  let resolvedDoctorName = doctor;

  if (!resolvedDoctorId && doctor) {
    const doc = await Doctor.findOne({ name: new RegExp(`^${doctor}$`, 'i') });
    if (doc) {
      resolvedDoctorId = doc.doctorId;
      resolvedDoctorName = doc.name;
    }
  }

  if (!resolvedDoctorId && actorRole === 'DOCTOR' && (actor.doctorId || actor.id)) {
    resolvedDoctorId = actor.doctorId || actor.id;
    if (!resolvedDoctorName && resolvedDoctorId) {
      const doc = await Doctor.findOne({ doctorId: resolvedDoctorId });
      if (doc) resolvedDoctorName = doc.name;
    }
  }

  // ── Authorization ──
  if (
    actorRole === 'PATIENT' &&
    actor.id !== patient.patientId &&
    actor.patientId !== patient.patientId
  ) {
    const err = new Error('Unauthorized: Patients can only upload documents to their own record.');
    err.status = 403;
    throw err;
  }

  // ── Build file path ──
  const ext = mimeType === 'application/pdf' ? 'pdf' : mimeType === 'image/png' ? 'png' : 'jpg';
  const uniqueToken = crypto.randomUUID();
  const filename = `${Date.now()}-${uniqueToken}.${ext}`;
  const fileKey = buildFileKey(patient.patientId, filename);

  // ── Write to disk ──
  await putLocalObject({ key: fileKey, buffer: file.buffer, mimeType });

  // ── Try background remote sync (no-op until wired up) ──
  syncToRemoteIfOnline(fileKey).catch(() => {});

  // ── Generate document ID ──
  const count = await MedicalDocument.countDocuments();
  const documentId = `DOC-${10000 + count}`;
  const retentionPolicy = calculateRetentionPolicy(type, examinationDate);

  const document = new MedicalDocument({
    documentId,
    patientId: patient.patientId,
    treatmentEpisodeId: treatmentEpisodeId || null,
    type,
    title: title || file.originalname || `Medical Record (${type})`,
    mimeType,
    fileSize,
    // fileKey replaces s3Key — same field is kept for schema compatibility
    s3Key: fileKey,
    s3Bucket: null,
    fileRef: fileKey,
    department: department || 'GENERAL',
    doctor: resolvedDoctorName || null,
    doctorId: resolvedDoctorId || null,
    examinationDate: new Date(examinationDate),
    status: 'ACTIVE',
    retentionPolicy,
    uploadedBy: actor.name || actor.id,
    uploadedByRole: actorRole,
  });

  await document.save();

  await logAction({
    actor: actor.name || actor.id,
    action: 'Document Uploaded (Local Storage)',
    entityType: 'MedicalDocument',
    entityId: documentId,
    metadata: { patientId: patient.patientId, type, title: document.title, fileKey, fileSize },
  });

  return document;
}

// ─── List ────────────────────────────────────────────────────────────────────

/**
 * List documents with filtering, authorization, and server-side pagination.
 *
 * Retention Notice included per document:
 *   - If type is LAB_REPORT / IMAGING / TEST_REPORT: shows expiry date.
 *   - Otherwise: "Stored permanently".
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
  // Patients can ONLY list their own documents
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

  if (patientId) query.patientId = patientId;
  if (category) query.type = category;
  if (department) query.department = department;
  if (doctor) query.$or = [{ doctor }, { doctorId: doctor }];

  if (status) {
    query.status = status;
  } else {
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
    MedicalDocument.find(query)
      .sort({ examinationDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
  ]);

  // Enrich each document with a pre-built download URL and retention notice
  const enriched = documents.map((doc) => {
    const obj = doc.toObject();
    obj.downloadUrl = buildLocalDownloadUrl(
      doc.s3Key,
      `${doc.title}.${doc.mimeType === 'application/pdf' ? 'pdf' : 'jpg'}`
    );

    if (doc.retentionPolicy?.autoDelete && doc.retentionPolicy?.expiresAt) {
      const daysLeft = Math.max(
        0,
        Math.ceil((doc.retentionPolicy.expiresAt - Date.now()) / (1000 * 60 * 60 * 24))
      );
      obj.retentionNotice = `⚠️ Auto-deleted after 6 months from examination date (${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining)`;
    } else {
      obj.retentionNotice = 'Stored permanently';
    }

    return obj;
  });

  return {
    data: enriched,
    pagination: {
      total: totalCount,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(totalCount / limitNum),
    },
  };
}

// ─── Download URL ────────────────────────────────────────────────────────────

/**
 * Generate a local download URL for a document.
 * The URL is served by the Express /api/documents/file/:encodedKey endpoint.
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

  // Patients can only download their own documents
  if (actorRole === 'PATIENT') {
    const allowedId = actor.patientId || actor.id;
    if (document.patientId !== allowedId) {
      const err = new Error('Unauthorized: You can only view and download your own medical records.');
      err.status = 403;
      throw err;
    }
  }

  // Verify the file is still on disk
  const { exists } = await checkLocalObjectExists({ key: document.s3Key });
  if (!exists) {
    const err = new Error('File not found on storage — it may have been deleted by the retention policy.');
    err.status = 404;
    throw err;
  }

  const filename = `${document.title}.${document.mimeType === 'application/pdf' ? 'pdf' : 'jpg'}`;
  const downloadUrl = buildLocalDownloadUrl(document.s3Key, filename);

  await logAction({
    actor: actor.name || actor.id,
    action: 'Document Download URL Generated',
    entityType: 'MedicalDocument',
    entityId: documentId,
    metadata: { patientId: document.patientId, title: document.title },
  });

  return {
    documentId: document.documentId,
    title: document.title,
    mimeType: document.mimeType,
    downloadUrl,
    // No expiry — URL is valid as long as the file is on disk
    expiresInSeconds: null,
  };
}

// ─── Delete (Patient Only) ───────────────────────────────────────────────────

/**
 * Delete a medical record.
 *
 * 🔒 STRICT RULE: ONLY the patient who owns the record may delete it.
 *    Doctors and Admins are explicitly rejected.
 */
export async function deleteDocument({ documentId, actor, actorRole }) {
  const document = await MedicalDocument.findOne({ documentId });
  if (!document) {
    const err = new Error('Document not found');
    err.status = 404;
    throw err;
  }

  // Strict role check
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

  // Legal hold check
  if (document.legalHold) {
    const err = new Error('Cannot delete document: An active legal/medical hold is in place.');
    err.status = 400;
    throw err;
  }

  // Delete from disk
  await deleteLocalObject({ key: document.s3Key });

  document.status = 'DELETED';
  document.deletedAt = new Date();
  document.deletedBy = actor.name || actor.id;
  await document.save();

  await logAction({
    actor: actor.name || actor.id,
    action: 'Document Deleted by Patient',
    entityType: 'MedicalDocument',
    entityId: documentId,
    metadata: { patientId: document.patientId, title: document.title },
  });

  return { success: true, documentId, status: 'DELETED' };
}

// ─── Legal Hold ──────────────────────────────────────────────────────────────

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

// ─── Retention Deletion Worker ───────────────────────────────────────────────

/**
 * Scheduled worker that auto-purges documents past their retention expiry.
 *
 * ⚠️  RETENTION RULE:
 *   Documents of type LAB_REPORT, IMAGING, or TEST_REPORT that were uploaded
 *   (examination date) more than 6 months (180 days) ago are AUTOMATICALLY
 *   DELETED from disk and marked DELETED in MongoDB.
 *
 *   This is displayed to users in the upload form and document list view.
 */
export async function runRetentionDeletionWorker() {
  const now = new Date();
  const summary = { checked: 0, purged: 0, failed: 0 };

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
      await deleteLocalObject({ key: doc.s3Key });

      doc.status = 'DELETED';
      doc.deletedAt = new Date();
      doc.deletedBy = 'SYSTEM_RETENTION_WORKER';
      await doc.save();
      summary.purged += 1;

      await logAction({
        actor: 'SYSTEM_RETENTION_WORKER',
        action: 'Document Auto-Purged by Retention Policy (6-month rule)',
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
      doc.deletionRetryCount = (doc.deletionRetryCount || 0) + 1;
      doc.deletionError = err.message;
      await doc.save();
      summary.failed += 1;
    }
  }

  return summary;
}
