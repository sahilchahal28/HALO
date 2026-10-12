import express from 'express';
import multer from 'multer';
import * as documentController from '../controllers/documentController.js';
import { mockStorage } from '../config/s3.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

// Robust mock endpoints for local/test offline development without AWS credentials
router.put('/mock-upload', express.raw({ type: '*/*', limit: '20mb' }), (req, res) => {
  const key = req.query.key || 'default';
  mockStorage.set(key, {
    data: req.body,
    contentType: req.headers['content-type'],
  });
  res.status(200).send();
});

router.get('/mock-file', (req, res) => {
  const key = req.query.key || 'default';
  const file = mockStorage.get(key);
  if (!file) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="mock-record.pdf"');
    return res.send(Buffer.from('%PDF-1.4\n1 0 obj\n<< /Title (HALO Medical Record) >>\nendobj\ntrailer\n<<>>\n%%EOF'));
  }
  res.setHeader('Content-Type', file.contentType || 'application/octet-stream');
  res.send(file.data);
});

// Direct multipart upload (Preferred: handles buffer on backend, avoids all browser CORS & presigned issues)
router.post('/upload', upload.single('file'), documentController.directUpload);

// Presigned URL flow routes
router.post('/upload-intent', documentController.initiateUpload);
router.post('/:documentId/confirm', documentController.confirmUpload);
router.get('/', documentController.listDocuments);
router.get('/:documentId/download-url', documentController.getDownloadUrl);
router.delete('/:documentId', documentController.deleteDocument); // Patient ONLY
router.patch('/:documentId/legal-hold', documentController.updateLegalHold);
router.post('/retention-worker/run', documentController.runRetentionWorker);

export default router;
