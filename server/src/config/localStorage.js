/**
 * Local Filesystem Storage — replaces S3 / Cloudflare R2.
 *
 * Files are stored under:
 *   <SERVER_ROOT>/storage/users/<patientId>/<type>/<filename>
 *
 * This means records are segregated per user, readable offline, and can be
 * synced to any remote destination whenever a network connection is available.
 *
 * Retention Rule:
 *   LAB_REPORT, IMAGING, TEST_REPORT older than 6 months (180 days) are
 *   auto-deleted by the retention worker.
 *   All other types (PRESCRIPTION, DISCHARGE_SUMMARY, REFERRAL, OTHER) are PERMANENT.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base storage directory — override via LOCAL_STORAGE_ROOT env var if needed
export const STORAGE_ROOT = process.env.LOCAL_STORAGE_ROOT
  ? path.resolve(process.env.LOCAL_STORAGE_ROOT)
  : path.resolve(__dirname, '../../storage/users');

/** Ensure a directory exists (recursive). */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Create root on module load
ensureDir(STORAGE_ROOT);

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build the absolute filesystem path for a file.
 * Keeps the same key format used throughout the service layer:
 *   "records/<patientId>/<timestamp>-<uuid>.<ext>"
 * We map that directly under STORAGE_ROOT.
 */
export function getLocalFilePath(fileKey) {
  // Normalise: replace any leading "records/" and forward-slashes are kept as directory separators
  const relative = fileKey.startsWith('records/') ? fileKey : `records/${fileKey}`;
  return path.join(STORAGE_ROOT, relative);
}

/**
 * Build a canonical file key given a patientId and desired filename.
 * Key format: records/<patientId>/<ts>-<uuid>.<ext>
 */
export function buildFileKey(patientId, filename) {
  return `records/${patientId}/${filename}`;
}

// ─── Core Storage Operations ─────────────────────────────────────────────────

/**
 * Write a file buffer to the local filesystem.
 * Creates missing parent directories automatically.
 */
export async function putLocalObject({ key, buffer, mimeType }) {
  const filePath = getLocalFilePath(key);
  const dir = path.dirname(filePath);
  ensureDir(dir);

  await fs.promises.writeFile(filePath, buffer);
  console.log('[LocalStorage] PUT', { key, size: buffer.length, mimeType });
  return { success: true };
}

/**
 * Delete a file from the local filesystem.
 * Silently succeeds if the file is already missing.
 */
export async function deleteLocalObject({ key }) {
  const filePath = getLocalFilePath(key);
  if (fs.existsSync(filePath)) {
    await fs.promises.unlink(filePath);
    console.log('[LocalStorage] DELETE', { key });
  } else {
    console.log('[LocalStorage] DELETE (not found — already gone)', { key });
  }
  return { deleted: true };
}

/**
 * Check whether a file exists on disk and return its size.
 */
export async function checkLocalObjectExists({ key }) {
  const filePath = getLocalFilePath(key);
  if (!fs.existsSync(filePath)) {
    return { exists: false, size: 0 };
  }
  const stats = await fs.promises.stat(filePath);
  return { exists: true, size: stats.size };
}

/**
 * Build a URL that the backend will serve back to the caller.
 * Format: /api/documents/file/<base64-encoded-key>
 * The key is base64-encoded to safely include slashes in a URL path segment.
 */
export function buildLocalDownloadUrl(key, filename) {
  const encodedKey = Buffer.from(key).toString('base64url');
  const safeName = (filename || 'medical-document').replace(/[^\w.-]/g, '_');
  return `/api/documents/file/${encodedKey}?name=${encodeURIComponent(safeName)}`;
}

/**
 * Decode a base64url key back to the original file key string.
 */
export function decodeFileKey(encodedKey) {
  return Buffer.from(encodedKey, 'base64url').toString('utf8');
}

// ─── Health Check ───────────────────────────────────────────────────────────

export function checkStorageHealth() {
  const writable = (() => {
    try {
      const testFile = path.join(STORAGE_ROOT, '.health');
      fs.writeFileSync(testFile, 'ok');
      fs.unlinkSync(testFile);
      return true;
    } catch {
      return false;
    }
  })();

  return {
    healthy: writable,
    provider: 'local-filesystem',
    root: STORAGE_ROOT,
  };
}

// ─── Network-Aware Sync Placeholder ─────────────────────────────────────────
/**
 * In a future iteration, this function can trigger a background upload
 * to a remote bucket / server when the host machine has an active network
 * connection.  For now it is a no-op stub that logs intent.
 */
export async function syncToRemoteIfOnline(key) {
  // navigator.onLine is browser-only; on Node.js we probe DNS instead
  // This is a stub — wire up real remote sync logic here when needed
  console.log('[LocalStorage] syncToRemoteIfOnline (stub):', key);
}
