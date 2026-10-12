import fs from 'fs';
import * as documentService from '../services/documentService.js';

/**
 * POST /api/documents/upload
 * Accepts multipart/form-data. Writes file to local filesystem.
 */
export async function directUpload(req, res, next) {
  try {
    console.log('[Upload] Received request:', {
      hasFile: !!req.file,
      fileSize: req.file?.size,
      mimeType: req.file?.mimetype,
      fileName: req.file?.originalname,
      bodyKeys: Object.keys(req.body),
      patientId: req.body.patientId,
      type: req.body.type,
      title: req.body.title,
      department: req.body.department,
      doctor: req.body.doctor,
      user: req.user ? { id: req.user.id, role: req.user.role, name: req.user.name } : 'no-user',
    });

    const actor = req.user || { id: 'admin', role: 'ADMIN', name: 'Admin' };
    const actorRole = actor.role;

    const result = await documentService.directDocumentUpload({
      ...req.body,
      file: req.file,
      actor,
      actorRole,
    });

    console.log('[Upload] Success:', { documentId: result.documentId });

    // Realtime notification to patient room & admin room
    const io = req.app.get('io');
    if (io && result.patientId) {
      const payload = {
        documentId: result.documentId,
        patientId: result.patientId,
        fileKey: result.s3Key,
        metadata: {
          documentId: result.documentId,
          patientId: result.patientId,
          treatmentEpisodeId: result.treatmentEpisodeId,
          type: result.type,
          title: result.title,
          mimeType: result.mimeType,
          fileSize: result.fileSize,
          department: result.department,
          doctor: result.doctor,
          doctorId: result.doctorId,
          examinationDate: result.examinationDate,
          status: result.status,
          legalHold: result.legalHold,
          retentionPolicy: result.retentionPolicy,
          uploadedBy: result.uploadedBy,
          uploadedByRole: result.uploadedByRole,
          createdAt: result.createdAt,
          updatedAt: result.updatedAt,
        },
      };
      io.to(`patient:${result.patientId}`).to('patient:all').emit('document:uploaded', payload);
    }

    res.status(201).json(result);
  } catch (err) {
    console.error('[Upload] Error:', { message: err.message, status: err.status, stack: err.stack });
    next(err);
  }
}

/**
 * GET /api/documents
 * List medical documents with filtering & pagination.
 */
export async function listDocuments(req, res, next) {
  try {
    const actor = req.user || { id: 'admin', role: 'ADMIN', name: 'Admin' };
    const actorRole = actor.role;

    const result = await documentService.listDocuments({
      ...req.query,
      actor,
      actorRole,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/documents/:documentId/download-url
 * Returns a local file URL for the document.
 */
export async function getDownloadUrl(req, res, next) {
  try {
    const { documentId } = req.params;
    const actor = req.user || { id: 'admin', role: 'ADMIN', name: 'Admin' };
    const actorRole = actor.role;

    const result = await documentService.getDocumentDownloadUrl({
      documentId,
      actor,
      actorRole,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/documents/:documentId/blob
 * Direct binary stream for IndexedDB cache synchronization.
 */
export async function streamDocumentBlob(req, res, next) {
  try {
    const { documentId } = req.params;
    const actor = req.user || { id: 'admin', role: 'ADMIN', name: 'Admin' };
    const actorRole = actor.role;

    const { filePath, mimeType, filename } = await documentService.getDocumentBlobStream({
      documentId,
      actor,
      actorRole,
    });

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Cache-Control', 'private, max-age=3600');

    const stream = fs.createReadStream(filePath);
    stream.on('error', (err) => {
      console.error('[Document Blob Stream] Stream error:', err);
      if (!res.headersSent) res.status(500).json({ error: 'Failed to stream document blob.' });
    });
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/documents/sync-delta
 * Returns incremental delta changes for IndexedDB syncing.
 */
export async function getSyncDelta(req, res, next) {
  try {
    const actor = req.user || { id: 'admin', role: 'ADMIN', name: 'Admin' };
    const actorRole = actor.role;
    const { patientId, since } = req.query;

    const delta = await documentService.getSyncDelta({
      patientId,
      since,
      actor,
      actorRole,
    });

    res.json(delta);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/documents/:documentId
 * Patient-only: delete a medical record from disk and database.
 */
export async function deleteDocument(req, res, next) {
  try {
    const { documentId } = req.params;
    const actor = req.user || { id: 'admin', role: 'ADMIN', name: 'Admin' };
    const actorRole = actor.role;

    const result = await documentService.deleteDocument({
      documentId,
      actor,
      actorRole,
    });

    // Realtime notification
    const io = req.app.get('io');
    if (io) {
      io.to(`patient:${result.patientId || ''}`).to('patient:all').emit('document:deleted', {
        documentId: result.documentId,
        fileKey: result.fileKey,
        patientId: result.patientId,
      });
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/documents/:documentId/legal-hold
 */
export async function updateLegalHold(req, res, next) {
  try {
    const { documentId } = req.params;
    const { legalHold, reason } = req.body;
    const actor = req.user || { id: 'admin', role: 'ADMIN', name: 'Admin' };
    const actorRole = actor.role;

    const result = await documentService.updateLegalHold({
      documentId,
      legalHold,
      reason,
      actor,
      actorRole,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/documents/retention-worker/run
 * Manually trigger the retention cleanup (normally runs on a 24-hour schedule).
 */
export async function runRetentionWorker(req, res, next) {
  try {
    const summary = await documentService.runRetentionDeletionWorker();
    res.json({ message: 'Retention worker run completed', summary });
  } catch (err) {
    next(err);
  }
}
