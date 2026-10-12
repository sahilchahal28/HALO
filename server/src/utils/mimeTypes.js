/**
 * Shared file-type rules for medical-record uploads.
 *
 * Accepted: PDF + any image format (JPEG, PNG, HEIC/HEIF from iPhones,
 * WebP, AVIF, GIF, TIFF, BMP). SVG is rejected because SVG files can
 * contain executable script and are rendered as documents by browsers.
 */

const BLOCKED_IMAGE_TYPES = new Set(['image/svg+xml']);

export function isAllowedMimeType(mimeType) {
  if (!mimeType || typeof mimeType !== 'string') return false;
  if (mimeType === 'application/pdf') return true;
  if (BLOCKED_IMAGE_TYPES.has(mimeType)) return false;
  return mimeType.startsWith('image/');
}

/**
 * Filesystem extension for a mime type (used for on-disk filenames and
 * the Content-Type map when serving files back).
 */
export function fileExtensionFor(mimeType, originalname = '') {
  if (mimeType === 'application/pdf') return 'pdf';
  const subtype = String(mimeType).split('/')[1];
  if (subtype) {
    const ext = subtype.toLowerCase();
    return ext === 'jpeg' ? 'jpg' : ext;
  }
  const name = String(originalname || '');
  const dot = name.lastIndexOf('.');
  if (dot > -1 && dot < name.length - 1) {
    return name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  }
  return 'bin';
}

/** Content-Type for serving a stored file based on its extension. */
export function contentTypeForExtension(ext) {
  const map = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.jpe': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.heic': 'image/heic',
    '.heif': 'image/heif',
    '.avif': 'image/avif',
    '.tif': 'image/tiff',
    '.tiff': 'image/tiff',
    '.bmp': 'image/bmp',
  };
  return map[ext] || 'application/octet-stream';
}
