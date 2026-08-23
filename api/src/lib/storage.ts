import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3'
import type { Readable } from 'node:stream'
import { env } from './env.js'

export const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  // MinIO não faz virtual-host addressing sem DNS wildcard.
  forcePathStyle: true,
  credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
})

export async function putObject(key: string, body: Buffer, contentType: string) {
  await s3.send(new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  }))
}

export async function getObjectStream(key: string, range?: string) {
  const out = await s3.send(new GetObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    Range: range,
  }))
  return {
    body: out.Body as Readable,
    contentType: out.ContentType ?? 'application/octet-stream',
    contentLength: out.ContentLength,
    contentRange: out.ContentRange,
    etag: out.ETag,
  }
}

export async function deleteObject(key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }))
}
