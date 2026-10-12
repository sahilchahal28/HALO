import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListBucketsCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');

const AWS_REGION = process.env.AWS_REGION || 'ap-southeast-2';
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY;
export const BUCKET_NAME = process.env.AWS_S3_BUCKET || process.env.R2_BUCKET_NAME || 'halo-medical-records';

// Support custom endpoints (e.g. Cloudflare R2, MinIO, or LocalStack)
const customEndpoint = process.env.AWS_ENDPOINT || process.env.AWS_S3_ENDPOINT ||
  (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined);

const clientConfig = {
  region: AWS_REGION,
  maxAttempts: 3,
  retryMode: 'adaptive',
  ...(customEndpoint && {
    endpoint: customEndpoint,
    region: process.env.AWS_REGION || 'auto',
    forcePathStyle: true,
  }),
  forcePathStyle: true,
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

const MOCK_STORAGE_DIR = join(__dirname, '../../.mock-s3');
if (!existsSync(MOCK_STORAGE_DIR)) {
  mkdirSync(MOCK_STORAGE_DIR, { recursive: true });
}

function getMockFilePath(key) {
  return join(MOCK_STORAGE_DIR, key.replace(/\//g, '_'));
}

export async function putS3Object({ key, buffer, mimeType }) {
  const startTime = Date.now();
  const logMeta = { key, bucket: BUCKET_NAME, size: buffer?.length || 0, mimeType };

  if (!isS3Configured()) {
    const filePath = getMockFilePath(key);
    const dir = join(filePath, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    await new Promise((resolve, reject) => {
      const ws = createWriteStream(filePath);
      ws.write(buffer);
      ws.end();
      ws.on('finish', resolve);
      ws.on('error', reject);
    });
    console.log('[S3:MOCK] PUT', { ...logMeta, durationMs: Date.now() - startTime, isMock: true });
    return { success: true, isMock: true };
  }

  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    });

    await s3Client.send(command);
    console.log('[S3] PUT success', { ...logMeta, durationMs: Date.now() - startTime, isMock: false });
    return { success: true, isMock: false };
  } catch (err) {
    console.error('[S3] PUT failed', { ...logMeta, durationMs: Date.now() - startTime, error: err.message, isMock: false });
    throw err;
  }
}

export async function putS3ObjectMultipart({ key, buffer, mimeType, partSize = 5 * 1024 * 1024 }) {
  const startTime = Date.now();
  const logMeta = { key, bucket: BUCKET_NAME, size: buffer?.length || 0, mimeType };

  if (!isS3Configured()) {
    return putS3Object({ key, buffer, mimeType });
  }

  try {
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      },
      partSize,
      queueSize: 4,
    });

    upload.on('httpUploadProgress', (progress) => {
      console.log('[S3] multipart progress', { key, loaded: progress.loaded, total: progress.total });
    });

    await upload.done();
    console.log('[S3] multipart PUT success', { ...logMeta, durationMs: Date.now() - startTime, isMock: false });
    return { success: true, isMock: false };
  } catch (err) {
    console.error('[S3] multipart PUT failed', { ...logMeta, durationMs: Date.now() - startTime, error: err.message, isMock: false });
    throw err;
  }
}

export async function generatePresignedUploadUrl({ key, mimeType, contentLength, expiresIn = 900 }) {
  const startTime = Date.now();

  if (!isS3Configured()) {
    return {
      uploadUrl: `/api/documents/mock-upload?key=${encodeURIComponent(key)}`,
      isMock: true,
    };
  }

  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: mimeType,
      ...(contentLength && { ContentLength: contentLength }),
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });
    console.log('[S3] presigned PUT generated', { key, expiresIn, durationMs: Date.now() - startTime, isMock: false });
    return { uploadUrl, isMock: false };
  } catch (err) {
    console.error('[S3] presigned PUT failed', { key, error: err.message, durationMs: Date.now() - startTime });
    throw err;
  }
}

export async function generatePresignedDownloadUrl({ key, filename, expiresIn = 3600 }) {
  const startTime = Date.now();

  if (!isS3Configured()) {
    return {
      downloadUrl: `/api/documents/mock-file?key=${encodeURIComponent(key)}`,
      isMock: true,
    };
  }

  try {
    const sanitizedFilename = (filename || 'medical-document').replace(/[^\w.-]/g, '_');
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ResponseContentDisposition: `inline; filename="${sanitizedFilename}"`,
    });

    const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn });
    console.log('[S3] presigned GET generated', { key, expiresIn, durationMs: Date.now() - startTime, isMock: false });
    return { downloadUrl, isMock: false };
  } catch (err) {
    console.error('[S3] presigned GET failed', { key, error: err.message, durationMs: Date.now() - startTime });
    throw err;
  }
}

export async function checkS3ObjectExists({ key }) {
  const startTime = Date.now();

  if (!isS3Configured()) {
    const filePath = getMockFilePath(key);
    const exists = existsSync(filePath);
    let size = 0;
    if (exists) {
      const stats = await new Promise((resolve, reject) => {
        import('fs').then(fs => fs.stat(filePath, (err, stats) => err ? reject(err) : resolve(stats))).catch(reject);
      });
      size = stats.size;
    }
    console.log('[S3:MOCK] HEAD', { key, exists, size, durationMs: Date.now() - startTime, isMock: true });
    return { exists, size, isMock: true };
  }

  try {
    const headCommand = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    const head = await s3Client.send(headCommand);
    console.log('[S3] HEAD success', { key, size: head.ContentLength, durationMs: Date.now() - startTime, isMock: false });
    return {
      exists: true,
      size: head.ContentLength,
      mimeType: head.ContentType,
      lastModified: head.LastModified,
      isMock: false,
    };
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      console.log('[S3] HEAD not found', { key, durationMs: Date.now() - startTime, isMock: false });
      return { exists: false, isMock: false };
    }
    console.error('[S3] HEAD failed', { key, error: err.message, durationMs: Date.now() - startTime, isMock: false });
    throw err;
  }
}

export async function deleteS3Object({ key }) {
  const startTime = Date.now();

  if (!isS3Configured()) {
    const filePath = getMockFilePath(key);
    if (existsSync(filePath)) {
      await new Promise((resolve, reject) => {
        import('fs').then(fs => fs.unlink(filePath, err => err ? reject(err) : resolve())).catch(reject);
      });
    }
    console.log('[S3:MOCK] DELETE', { key, durationMs: Date.now() - startTime, isMock: true });
    return { deleted: true, isMock: true };
  }

  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    await s3Client.send(command);
    console.log('[S3] DELETE success', { key, durationMs: Date.now() - startTime, isMock: false });
    return { deleted: true, isMock: false };
  } catch (err) {
    console.error('[S3] DELETE failed', { key, error: err.message, durationMs: Date.now() - startTime, isMock: false });
    throw err;
  }
}

export async function checkS3Health() {
  const startTime = Date.now();

  if (!isS3Configured()) {
    return {
      healthy: true,
      provider: 'mock',
      bucket: BUCKET_NAME,
      region: AWS_REGION,
      latencyMs: Date.now() - startTime,
    };
  }

  try {
    const command = new ListBucketsCommand({});
    await s3Client.send(command);
    return {
      healthy: true,
      provider: customEndpoint ? 'custom-s3' : 'aws-s3',
      bucket: BUCKET_NAME,
      region: AWS_REGION,
      endpoint: customEndpoint || undefined,
      latencyMs: Date.now() - startTime,
    };
  } catch (err) {
    return {
      healthy: false,
      provider: customEndpoint ? 'custom-s3' : 'aws-s3',
      bucket: BUCKET_NAME,
      region: AWS_REGION,
      error: err.message,
      latencyMs: Date.now() - startTime,
    };
  }
}

export function isTransientS3Error(err) {
  if (!err) return false;
  const transientCodes = [
    'Throttling',
    'RequestLimitExceeded',
    'RequestThrottled',
    'RequestThrottledException',
    'SlowDown',
    'ServiceUnavailable',
    'InternalError',
    '503',
    '500',
    '502',
    '504',
    'ETIMEDOUT',
    'ECONNRESET',
    'ENOTFOUND',
    'TimeoutError',
    'NetworkingError',
  ];
  const code = err.Code || err.code || err.name || '';
  const status = err.$metadata?.httpStatusCode || 0;
  return transientCodes.some(c => code.includes(c)) || (status >= 500 && status < 600);
}