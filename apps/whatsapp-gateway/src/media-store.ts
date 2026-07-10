import { GridFSBucket } from "mongodb"
import { getDb } from "@workspace/db/client"

/**
 * Gelen WhatsApp medyası GridFS'te `whatsapp_media` bucket'ında saklanır.
 * Self-contained: CDN/bucket provisioning gerektirmez, gateway'in mevcut
 * Mongo bağlantısını kullanır. (CDN'e taşıma sonraki optimizasyon.)
 *
 * Dashboard app medyayı `metadata.companyId` IDOR guard'ı ile serve eder.
 */

const BUCKET_NAME = "whatsapp_media"

async function bucket(): Promise<GridFSBucket> {
  const db = await getDb()
  return new GridFSBucket(db, { bucketName: BUCKET_NAME })
}

export async function storeMedia(
  companyId: string,
  sessionId: string,
  buffer: Buffer,
  opts: { mimetype: string | null; fileName: string | null },
): Promise<string> {
  const b = await bucket()
  return new Promise<string>((resolve, reject) => {
    const stream = b.openUploadStream(opts.fileName || "media", {
      metadata: { companyId, sessionId, mimetype: opts.mimetype },
    })
    stream.on("error", reject)
    stream.on("finish", () => resolve(stream.id.toString()))
    stream.end(buffer)
  })
}
