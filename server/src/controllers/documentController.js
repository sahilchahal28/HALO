import * as documentService from '../services/documentService.js';

export async function initiateUpload(req, res, next) {
  try {
    const actor = req.user || { id: 'admin', role: 'ADMIN', name: 'Admin' };
    const actorRole = actor.role;

    const result = await documentService.initiateDocumentUpload({
      ...req.body,
      actor,
      actorRole,
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function directUpload(req, res, next) {
  try {
    console.log('[Upload] Received request:', {
      hasFile: !!req.file,
      fileSize: req.file?.size,
      mimeType: req.file?.mimetype,
      fileName: req.file?.originalname,
      bodyKeys: Object.keys(req.body),
      patientId: req.body.patientId,
      treatmentEpisodeId: req.body.treatmentEpisodeId,
      type: req.body.type,
      title: req.body.title,
      department: req.body.department,
      doctor: req.body.doctor,
      doctorId: req.body.doctorId,
      user: req.user ? { id: req.user.id, role: req.user.role, name: req.user.name } : 'no-user'
    });

    const actor = req.user || { id: 'admin', role: 'ADMIN', name: 'Admin' };
    const actorRole = actor.role;

    const result = await documentService.directDocumentUpload({
      ...req.body,
      file: req.file,
      actor,
      actorRole,
    });

    console.log('[Upload] Success:', { documentId: result.documentId, s3Key: result.s3Key });
    res.status(201).json(result);
  } catch (err) {
    console.error('[Upload] Error:', { message: err.message, status: err.status, statusCode: err.statusCode, stack: err.stack });
    next(err);
  }
}

export async function confirmUpload(req, res, next) {
  try {
    const { documentId } = req.params;
    const actor = req.user || { id: 'admin', role: 'ADMIN', name: 'Admin' };
    const actorRole = actor.role;

    const document = await documentService.confirmDocumentUpload({
      documentId,
      actor,
      actorRole,
    });

    res.json(document);
  } catch (err) {
    next(err);
  }
}

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

    res.json(result);
  } catch (err) {
    next(err);
  }
}

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

export async function runRetentionWorker(req, res, next) {
  try {
    const summary = await documentService.runRetentionDeletionWorker();
    res.json({ message: 'Retention worker run completed', summary });
  } catch (err) {
    next(err);
  }
}
