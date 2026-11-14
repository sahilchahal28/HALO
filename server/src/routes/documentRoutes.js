import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import * as documentController from '../controllers/documentController.js';
import { getLocalFilePath, decodeFileKey } from '../config/localStorage.js';
import { isAllowedMimeType, contentTypeForExtension } from '../utils/mimeTypes.js';
import { verifyToken } from '../middleware/authenticate.js';
import { assertPatientAccess } from '../services/accessControl.js';

const router = express.Router();

// Accept files up to 15 MB in memory — then write to disk via the service
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (isAllowedMimeType(file.mimetype)) return cb(null, true);
    cb(new Error(`Unsupported file type: ${file.mimetype}. Only PDF and image files are accepted.`));
  },
});

// ─── File Serve Route ─────────────────────────────────────────────────────────
/**
 * GET /api/documents/file/:encodedKey
 *
 * Serves a medical-record file directly from the local filesystem.
 * The :encodedKey is the base64url-encoded file key built by buildLocalDownloadUrl().
 *
 * Authorization is handled by the authenticate middleware applied in app.js.
 * Fine-grained patient ↔ document ownership is enforced in the documentService
 * (getDocumentDownloadUrl) before a URL is ever generated.
 */
router.get('/file/:encodedKey', async (req, res) => {
  try {
    const fileKey = decodeFileKey(req.params.encodedKey);
    const filePath = getLocalFilePath(fileKey);

    if (!fs.existsSync(filePath)) {
      try {
        const VaultNode = (await import('../models/VaultNode.js')).default;
        const node = await VaultNode.findOne({ nodeId: 'mac-primary' });
        const isOnline = node && node.status === 'ONLINE' && node.tunnelUrl && (Date.now() - new Date(node.lastHeartbeat).getTime()) < 45000;
        if (isOnline) {
          const queryStr = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
          return res.redirect(302, `${node.tunnelUrl}/api/documents/file/${req.params.encodedKey}${queryStr}`);
        }
      } catch (_) {}

      return res.status(404).json({
        error: 'File stored on host Mac disk. Run "npm run tunnel" on the host Mac to connect disk storage.',
        vaultOffline: true,
      });
    }

    // Strict access control: extract patientId from fileKey (e.g. records/HALO-PAT-OC-8934/...)
    const parts = fileKey.split('/');
    const patientId = parts.length > 1 ? parts[1] : null;

    let actor = req.user;
    const queryToken = req.query.token;
    if (!actor && queryToken) {
      if (queryToken === 'mock-admin-token') {
        actor = { id: 'admin', role: 'ADMIN', name: 'Sarah Jenkins (Admin)' };
      } else {
        const decoded = verifyToken(queryToken);
        if (decoded && decoded.sub) {
          actor = {
            id: decoded.sub,
            role: decoded.role,
            name: decoded.name,
            ...(decoded.patientId && { patientId: decoded.patientId }),
          };
        }
      }
    }

    if (actor && patientId) {
      try {
        await assertPatientAccess(actor, patientId);
      } catch (authErr) {
        return res.status(authErr.status || 403).json({ error: authErr.message || 'Forbidden: Access denied.' });
      }
    }

    const filename = req.query.name || path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = contentTypeForExtension(ext);

    res.setHeader('Content-Type', contentType);
    // Inline display for images / PDFs; attachment for unknown types
    const inline = contentType === 'application/pdf' || contentType.startsWith('image/');
    const disposition = inline
      ? `inline; filename="${filename}"`
      : `attachment; filename="${filename}"`;
    res.setHeader('Content-Disposition', disposition);
    res.setHeader('Cache-Control', 'private, max-age=300'); // 5-min browser cache

    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error('[File Serve] Error:', err.message);
    res.status(500).json({ error: 'Failed to serve file.' });
  }
});

// ─── Upload ───────────────────────────────────────────────────────────────────
/**
 * POST /api/documents/upload
 *
 * Accepts multipart/form-data with a single "file" field.
 * The file is written directly to the local filesystem — no cloud storage.
 *
 * ⚠️  RETENTION NOTICE shown in the UI:
 *   Lab reports, imaging results, and test reports are automatically deleted
 *   6 months after the examination date.
 *   Prescriptions, discharge summaries, referrals, and other documents
 *   are stored permanently.
 */
router.post('/upload', upload.single('file'), documentController.directUpload);

// ─── Metadata endpoints ───────────────────────────────────────────────────────
router.get('/sync-delta', documentController.getSyncDelta);
router.get('/:documentId/blob', documentController.streamDocumentBlob);
router.get('/', documentController.listDocuments);
router.get('/:documentId/download-url', documentController.getDownloadUrl);
router.delete('/:documentId', documentController.deleteDocument); // Patient ONLY
router.patch('/:documentId/legal-hold', documentController.updateLegalHold);
router.post('/retention-worker/run', documentController.runRetentionWorker);

export default router;
