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
