#!/usr/bin/env node
/**
 * S3 Bucket Setup Script
 * 
 * Run: npm run s3:setup
 * 
 * Creates/updates bucket with:
 * - CORS policy for direct browser uploads
 * - Lifecycle rules for incomplete multipart uploads
 * - Versioning (optional, for audit trail)
 * - Validates credentials and bucket access
 */

import { S3Client, PutBucketCorsCommand, PutBucketLifecycleConfigurationCommand, PutBucketVersioningCommand, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

dotenv.config();

const AWS_REGION = process.env.AWS_REGION || 'ap-southeast-2';
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const BUCKET_NAME = process.env.AWS_S3_BUCKET || 'halo-medical-records';
const CUSTOM_ENDPOINT = process.env.AWS_ENDPOINT || process.env.AWS_S3_ENDPOINT ||
  (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined);

if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
  console.error('❌ Missing AWS credentials. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY');
  process.exit(1);
}

const clientConfig = {
  region: AWS_REGION,
  forcePathStyle: true,
  ...(CUSTOM_ENDPOINT && { endpoint: CUSTOM_ENDPOINT, region: 'auto' }),
  credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY },
};

const s3 = new S3Client(clientConfig);

const CORS_CONFIG = {
  CORSRules: [
    {
      AllowedHeaders: ['*'],
      AllowedMethods: ['GET', 'PUT', 'POST', 'HEAD', 'DELETE'],
      AllowedOrigins: [
        'http://localhost:5173',
        'http://localhost:5174',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:5174',
        'https://halo-wheat.vercel.app',
        'https://*.vercel.app',
      ],
      ExposeHeaders: ['ETag', 'Content-Length', 'Content-Type'],
      MaxAgeSeconds: 3600,
    },
  ],
};

const LIFECYCLE_CONFIG = {
  Rules: [
    {
      ID: 'AbortIncompleteMultipartUploads',
      Status: 'Enabled',
      AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
    },
    {
      ID: 'ExpireOldDeleteMarkers',
      Status: 'Enabled',
      NoncurrentVersionExpiration: { NoncurrentDays: 30 },
    },
  ],
};

async function run() {
  console.log('🔧 HALO S3 Bucket Setup');
  console.log('========================');
  console.log(`Region: ${AWS_REGION}`);
  console.log(`Bucket: ${BUCKET_NAME}`);
  console.log(`Endpoint: ${CUSTOM_ENDPOINT || 'AWS Default'}`);
  console.log('');

  try {
    // 1. Check if bucket exists
    console.log('📋 Checking bucket access...');
    try {
      await s3.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
      console.log(`✅ Bucket "${BUCKET_NAME}" exists and accessible`);
    } catch (err) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        console.log(`📦 Bucket "${BUCKET_NAME}" not found. Creating...`);
        await s3.send(new CreateBucketCommand({
          Bucket: BUCKET_NAME,
          ...(AWS_REGION !== 'us-east-1' && { CreateBucketConfiguration: { LocationConstraint: AWS_REGION } }),
        }));
        console.log(`✅ Bucket created successfully`);
      } else {
        throw err;
      }
    }

    // 2. Apply CORS
    console.log('🌐 Applying CORS policy...');
    await s3.send(new PutBucketCorsCommand({
      Bucket: BUCKET_NAME,
      CORSConfiguration: CORS_CONFIG,
    }));
    console.log('✅ CORS policy applied');

    // 3. Apply Lifecycle
    console.log('♻️  Applying lifecycle rules...');
    await s3.send(new PutBucketLifecycleConfigurationCommand({
      Bucket: BUCKET_NAME,
      LifecycleConfiguration: LIFECYCLE_CONFIG,
    }));
    console.log('✅ Lifecycle rules applied');

    // 4. Enable Versioning (optional but recommended for medical records)
    console.log('📚 Enabling bucket versioning...');
    await s3.send(new PutBucketVersioningCommand({
      Bucket: BUCKET_NAME,
      VersioningConfiguration: { Status: 'Enabled' },
    }));
    console.log('✅ Versioning enabled');

    console.log('');
    console.log('🎉 S3 bucket setup complete!');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Verify CORS: aws s3api get-bucket-cors --bucket ' + BUCKET_NAME);
    console.log('  2. Test upload from browser dev tools');
    console.log('  3. Monitor CloudWatch for S3 metrics');

  } catch (err) {
    console.error('❌ Setup failed:', err.message);
    if (err.$metadata?.httpStatusCode === 403) {
      console.error('   → Check IAM permissions: s3:PutBucketCors, s3:PutBucketLifecycle, s3:PutBucketVersioning, s3:CreateBucket');
    }
    process.exit(1);
  }
}

run();