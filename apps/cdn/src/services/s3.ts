import type { Readable } from 'node:stream'
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectAclCommand,
} from '@aws-sdk/client-s3'

// Vendor-nötr S3_* birincil isimler; IDRIVE_* read-fallback (mevcut hosted
// cdn env churn'süz çalışmaya devam eder). Self-host jenerik S3_* kullanır.
const s3Client = new S3Client({
  endpoint: process.env.S3_ENDPOINT || process.env.IDRIVE_ENDPOINT || '',
  region: process.env.S3_REGION || process.env.IDRIVE_REGION || 'eu-central-2',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || process.env.IDRIVE_ACCESS_KEY || '',
    secretAccessKey: process.env.S3_SECRET_KEY || process.env.IDRIVE_SECRET_KEY || '',
  },
  forcePathStyle: true,
})

const BUCKET = process.env.S3_BUCKET || process.env.IDRIVE_BUCKET || ''

export async function uploadToS3(
  key: string,
  body: Buffer,
  contentType: string,
  isPublic: boolean = true
): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      ACL: isPublic ? 'public-read' : 'private',
    })
  )
}

export async function getFromS3(key: string): Promise<{ body: Buffer; contentType: string; etag: string | null }> {
  const response = await s3Client.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key })
  )

  if (!response.Body) {
    throw new Error('File not found')
  }

  const chunks: Uint8Array[] = []
  for await (const chunk of response.Body as any) {
    chunks.push(chunk)
  }

  return {
    body: Buffer.concat(chunks),
    contentType: response.ContentType || 'application/octet-stream',
    etag: response.ETag?.replace(/"/g, '') || null,
  }
}

export interface S3ObjectStream {
  body: Readable
  contentType: string
  contentLength: number | null
  etag: string | null
  /** Range isteğinde S3'ten dönen `bytes start-end/total`. */
  contentRange: string | null
  /** 206 (partial) mı 200 (full) mı. */
  partial: boolean
}

/**
 * S3 objesini STREAM olarak döndürür (Buffer'lamaz) — TTFB ilk-chunk'a düşer,
 * bellek objenin tamamı yerine ~1 chunk. Opsiyonel `range` ("bytes=start-end")
 * S3'e iletilir → 206 partial (video/audio seek). NoSuchKey fırlatır (caller
 * variant-fallback için yakalar). Body caller tarafından pipe/destroy edilmeli.
 */
export async function getObjectStream(key: string, range?: string): Promise<S3ObjectStream> {
  const response = await s3Client.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key, ...(range ? { Range: range } : {}) })
  )
  if (!response.Body) {
    throw new Error('File not found')
  }
  return {
    body: response.Body as Readable,
    contentType: response.ContentType || 'application/octet-stream',
    contentLength: typeof response.ContentLength === 'number' ? response.ContentLength : null,
    etag: response.ETag?.replace(/"/g, '') || null,
    contentRange: response.ContentRange || null,
    partial: !!response.ContentRange,
  }
}

export async function deleteFromS3(key: string): Promise<void> {
  await s3Client.send(
    new DeleteObjectCommand({ Bucket: BUCKET, Key: key })
  )
}

/**
 * Bir prefix altındaki tüm nesneleri listele (paginated). Büyük bucket'larda
 * defalarca `ListObjectsV2` çağrılır; tek bir allocation'a `Key` listesini
 * topluyoruz çünkü tüketici (bucket purge) hem keys'e göre filelardeki
 * silme sonucunu hem de toplam bytes'ı raporluyor. 10k+ objede bile pratik.
 */
export async function listS3Keys(prefix: string): Promise<string[]> {
  const keys: string[] = []
  let continuationToken: string | undefined = undefined

  do {
    const response: any = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    )
    for (const obj of response.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key)
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
  } while (continuationToken)

  return keys
}

/**
 * Chunked bulk delete. `DeleteObjects` tek çağrıda max 1000 key alır; bunu
 * aşan listeler otomatik parçalanır. Başarısız olanlar ikinci dönüşte geri
 * döner — çağıran toplar ve kullanıcıya raporlar.
 */
export async function deleteManyFromS3(keys: string[]): Promise<{ deleted: string[]; failed: string[] }> {
  const deleted: string[] = []
  const failed: string[] = []

  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000)
    if (chunk.length === 0) continue

    const response: any = await s3Client.send(
      new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: {
          Objects: chunk.map((Key) => ({ Key })),
          Quiet: false,
        },
      }),
    )

    for (const d of response.Deleted ?? []) {
      if (d.Key) deleted.push(d.Key)
    }
    for (const e of response.Errors ?? []) {
      if (e.Key) failed.push(e.Key)
    }
  }

  return { deleted, failed }
}

/**
 * ACL toggle. `PutObjectAcl` S3 objesinin ACL'ini değiştirir; object'in
 * kendisine dokunulmaz (ekonomik ve hızlı). Mass toggle için çağıran tüm
 * key listesini üretip paralel (pool'lu) olarak çağırmalı.
 */
export async function setS3ObjectAcl(key: string, isPublic: boolean): Promise<void> {
  await s3Client.send(
    new PutObjectAclCommand({
      Bucket: BUCKET,
      Key: key,
      ACL: isPublic ? 'public-read' : 'private',
    }),
  )
}
