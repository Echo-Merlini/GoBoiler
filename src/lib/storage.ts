import { S3Client, PutObjectCommand, ListObjectsV2Command, HeadBucketCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function getClient() {
  const region   = process.env.S3_REGION ?? "auto";
  const endpoint = process.env.S3_ENDPOINT;
  return new S3Client({
    region,
    credentials: {
      accessKeyId:     process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
  });
}

function bucket() {
  return process.env.S3_BUCKET!;
}

function publicUrl(key: string) {
  const base = process.env.S3_PUBLIC_URL;
  return base ? `${base.replace(/\/$/, "")}/${key}` : null;
}

export async function uploadFile(key: string, body: Buffer | Uint8Array, contentType: string) {
  const client = getClient();
  await client.send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }));
  return publicUrl(key) ?? key;
}

export async function presignUpload(key: string, contentType: string, expiresIn = 300) {
  const client = getClient();
  const cmd = new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType });
  const url = await getSignedUrl(client, cmd, { expiresIn });
  return { url, publicUrl: publicUrl(key) };
}

export async function testConnection() {
  const client = getClient();
  await client.send(new HeadBucketCommand({ Bucket: bucket() }));
}

export async function listFiles(prefix?: string, maxKeys = 50) {
  const client = getClient();
  const res = await client.send(new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix, MaxKeys: maxKeys }));
  return (res.Contents ?? []).map(o => ({ key: o.Key!, size: o.Size!, lastModified: o.LastModified!, url: publicUrl(o.Key!) }));
}
