import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY;
export const BUCKET_NAME = process.env.AWS_S3_BUCKET || process.env.R2_BUCKET_NAME || 'halo-medical-records';

// Support custom endpoints (e.g. Cloudflare R2, MinIO, or LocalStack)
const customEndpoint = process.env.AWS_ENDPOINT || process.env.AWS_S3_ENDPOINT ||
  (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined);

const clientConfig = {
  region: AWS_REGION,
  ...(customEndpoint && {
    endpoint: customEndpoint,
    // R2 and custom S3 endpoints typically require path-style or region 'auto'
    region: process.env.AWS_REGION || 'auto',
  }),
};

if (AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY) {
  clientConfig.credentials = {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  };
}

export const s3Client = new S3Client(clientConfig);

export function isS3Configured() {
  return Boolean(
    (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ||
    (process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY)
  );
}

/**
 * Generate a pre-signed PUT URL for direct client-to-S3/R2 upload.
 * Preserves private bucket security by delegating temporary upload rights.
 */
export async function generatePresignedUploadUrl({ key, mimeType, contentLength, expiresIn = 300 }) {
  if (!isS3Configured()) {
    // Graceful fallback for local offline development without AWS credentials
    return {
      uploadUrl: `/api/documents/mock-upload/${encodeURIComponent(key)}`,
      isMock: true,
    };
  }

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: mimeType,
    ...(contentLength && { ContentLength: contentLength }),
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });
  return { uploadUrl, isMock: false };
}

/**
 * Generate a short-lived pre-signed GET URL for authorized viewing/downloading.
 */
export async function generatePresignedDownloadUrl({ key, filename, expiresIn = 900 }) {
  if (!isS3Configured()) {
    return {
      downloadUrl: `/api/documents/mock-file/${encodeURIComponent(key)}`,
      isMock: true,
    };
  }

  const sanitizedFilename = (filename || 'medical-document').replace(/[^\w.-]/g, '_');
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ResponseContentDisposition: `inline; filename="${sanitizedFilename}"`,
  });

  const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn });
  return { downloadUrl, isMock: false };
}

/**
 * Verify if an object exists in S3/R2 and return its metadata.
 */
export async function checkS3ObjectExists({ key }) {
  if (!isS3Configured()) {
    return { exists: true, size: 1024, isMock: true };
  }

  try {
    const headCommand = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    const head = await s3Client.send(headCommand);
    return {
      exists: true,
      size: head.ContentLength,
      mimeType: head.ContentType,
      lastModified: head.LastModified,
      isMock: false,
    };
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      return { exists: false, isMock: false };
    }
    throw err;
  }
}

/**
 * Delete an object from S3/R2 bucket.
 */
export async function deleteS3Object({ key }) {
  if (!isS3Configured()) {
    return { deleted: true, isMock: true };
  }

  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });
  await s3Client.send(command);
  return { deleted: true, isMock: false };
}
