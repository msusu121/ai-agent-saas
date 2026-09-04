import { randomUUID } from 'node:crypto';

import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { env } from '../../config/env.js';

const protocol = env.MINIO_USE_SSL ? 'https' : 'http';

export const minio = new S3Client({
  region: 'us-east-1',
  endpoint: `${protocol}://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`,
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.MINIO_ACCESS_KEY,
    secretAccessKey: env.MINIO_SECRET_KEY,
  },
});

export async function ensurePrivateBucket(): Promise<void> {
  try {
    await minio.send(new HeadBucketCommand({ Bucket: env.MINIO_BUCKET }));
  } catch {
    await minio.send(new CreateBucketCommand({ Bucket: env.MINIO_BUCKET }));
  }
}

export async function createPresignedUpload(
  organizationId: string,
  filename: string,
): Promise<{ objectKey: string; url: string }> {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  const objectKey = `${organizationId}/${randomUUID()}-${safeName}`;
  const url = await getSignedUrl(
    minio,
    new PutObjectCommand({ Bucket: env.MINIO_BUCKET, Key: objectKey }),
    { expiresIn: 600 },
  );
  return { objectKey, url };
}
