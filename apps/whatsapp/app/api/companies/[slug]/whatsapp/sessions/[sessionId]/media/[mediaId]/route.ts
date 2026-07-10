import { NextRequest } from "next/server"
import { GridFSBucket, ObjectId } from "mongodb"
import { Readable } from "node:stream"
import { getDb } from "@workspace/db/client"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonError } from "@workspace/console/lib/api-helpers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Medyayı GridFS'ten serve eder. IDOR guard: dosya `metadata.companyId` +
 * `metadata.sessionId` istekle eşleşmeli. whatsapp.view zorunlu.
 */
export async function GET(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ slug: string; sessionId: string; mediaId: string }> },
) {
  const { slug, sessionId, mediaId } = await params
  const access = await resolveCompanyAccess(request, slug, "whatsapp.view")
  if ("error" in access) return access.error

  let oid: ObjectId
  try {
    oid = new ObjectId(mediaId)
  } catch {
    return jsonError("Invalid media id", 400)
  }

  const db = await getDb()
  const file = await db.collection("whatsapp_media.files").findOne({
    _id: oid,
    "metadata.companyId": access.companyId,
    "metadata.sessionId": sessionId,
  })
  if (!file) return jsonError("Media not found", 404)

  const bucket = new GridFSBucket(db, { bucketName: "whatsapp_media" })
  const stream = bucket.openDownloadStream(oid)
  const mimetype =
    (file.metadata as { mimetype?: string } | undefined)?.mimetype ||
    "application/octet-stream"

  return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": mimetype,
      "Cache-Control": "private, max-age=86400",
      ...(typeof file.length === "number"
        ? { "Content-Length": String(file.length) }
        : {}),
    },
  })
}
