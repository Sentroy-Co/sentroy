import { Readable } from "node:stream"
import {
  S3Client,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3"
import { Upload } from "@aws-sdk/lib-storage"

/**
 * S3 (iDrive e2 / S3-uyumlu) — yedek artefaktları için. storage-api-server ile
 * aynı env'ler (IDRIVE_*). Yükleme STREAMED multipart (@aws-sdk/lib-storage) —
 * GB'lık dump'lar RAM'e sığmaz; part-part yüklenir. İndirme de stream.
 *
 * Artefaktlar PRIVATE (ACL yok) — indirme yalnız app'in stream-proxy'si üzerinden,
 * company-scope + audit ile. Public URL yok.
 */

const ENDPOINT = process.env.IDRIVE_ENDPOINT || process.env.S3_ENDPOINT || ""
const REGION = process.env.IDRIVE_REGION || process.env.S3_REGION || "us-east-1"
const ACCESS_KEY = process.env.IDRIVE_ACCESS_KEY || process.env.S3_ACCESS_KEY || ""
const SECRET_KEY = process.env.IDRIVE_SECRET_KEY || process.env.S3_SECRET_KEY || ""
export const BUCKET =
  process.env.BACKUP_S3_BUCKET || process.env.IDRIVE_BUCKET || ""

let client: S3Client | null = null
function s3(): S3Client {
  if (client) return client
  if (!ENDPOINT || !ACCESS_KEY || !SECRET_KEY || !BUCKET) {
    throw new Error(
      "S3 not configured — set IDRIVE_ENDPOINT/ACCESS_KEY/SECRET_KEY + BACKUP_S3_BUCKET.",
    )
  }
  client = new S3Client({
    endpoint: ENDPOINT,
    region: REGION,
    credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
    forcePathStyle: true,
  })
  return client
}

/** Streamed multipart upload. onProgress: yüklenen byte sayısı. Toplam boyut döner. */
export async function uploadStream(
  key: string,
  body: Readable,
  onProgress?: (loadedBytes: number) => void,
): Promise<number> {
  const upload = new Upload({
    client: s3(),
    params: {
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: "application/gzip",
    },
    // 64MB part, en fazla 4 paralel part → bellek kullanımı ~256MB tavan.
    partSize: 64 * 1024 * 1024,
    queueSize: 4,
  })
  let loaded = 0
  upload.on("httpUploadProgress", (p) => {
    if (typeof p.loaded === "number") {
      loaded = p.loaded
      onProgress?.(loaded)
    }
  })
  await upload.done()
  return loaded
}

/** İndirme stream'i (restore veya app download-proxy için). */
export async function getStream(key: string): Promise<Readable> {
  const res = await s3().send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
  )
  return res.Body as Readable
}

export async function headSize(key: string): Promise<number | null> {
  try {
    const res = await s3().send(
      new HeadObjectCommand({ Bucket: BUCKET, Key: key }),
    )
    return typeof res.ContentLength === "number" ? res.ContentLength : null
  } catch {
    return null
  }
}

export async function deleteObject(key: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}
