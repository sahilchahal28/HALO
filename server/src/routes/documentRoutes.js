import express from 'express';
import * as documentController from '../controllers/documentController.js';

const router = express.Router();

// Mock endpoints for local offline development when AWS credentials are not configured
const mockStorage = new Map();

router.put('/mock-upload/:key', express.raw({ type: '*/*', limit: '20mb' }), (req, res) => {
  const key = decodeURIComponent(req.params.key);
  mockStorage.set(key, {
    data: req.body,
    contentType: req.headers['content-type'],
  });
  res.status(200).send();
});

router.get('/mock-file/:key', (req, res) => {
  const key = decodeURIComponent(req.params.key);
  const file = mockStorage.get(key);
  if (!file) {
    // Generate a minimal valid PDF placeholder for preview if not in local memory
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="mock-record.pdf"');
    return res.send(Buffer.from('%PDF-1.4\n1 0 obj\n<< /Title (HALO Medical Record) >>\nendobj\ntrailer\n<<>>\n%%EOF'));
  }
  res.setHeader('Content-Type', file.contentType || 'application/octet-stream');
  res.send(file.data);
});

// Document API routes
router.post('/upload-intent', documentController.initiateUpload);
router.post('/:documentId/confirm', documentController.confirmUpload);
router.get('/', documentController.listDocuments);
router.get('/:documentId/download-url', documentController.getDownloadUrl);
router.delete('/:documentId', documentController.deleteDocument); // Patient ONLY
router.patch('/:documentId/legal-hold', documentController.updateLegalHold);
router.post('/retention-worker/run', documentController.runRetentionWorker);

export default router;
