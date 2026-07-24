import { NextRequest, NextResponse } from "next/server"
import { bucketModel, mediaModel } from "@workspace/db/models"
import { isSystemManagedBucketSlug } from "@workspace/db/constants"

/**
 * Public media metadata `/api/public/media/<id>` — link ile paylaşılan (public)
 * bir dosyanın anonim okunabilir metaverisi. Mobil universal/app-link handler'ı
 * bunu çözerek uygulama içi zengin görüntüleyiciyi kurar (tür → player/pdf/txt/
 * görsel). `/v/[id]` sayfasıyla AYNI public gate: yalnız public-bucket +
 * public-media döner, aksi 404. Ham byte hâlâ `/f/<id>` üzerinden servis edilir.
 *
 * Kimlik gerektirmez; middleware `/api/*` dalında CORS başlıklarını ekler.
 */

export const dynamic = "force-dynamic"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!id) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const media = await mediaModel.findById(id)
  if (!media || !media.isPublic) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  const bucket = await bucketModel.findById(media.bucketId)
  if (!bucket || !bucket.isPublic || isSystemManagedBucketSlug(bucket.slug)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json({
    data: {
      id: media.id,
      name: media.originalName,
      type: media.type, // image | video | audio | document | other
      mimeType: media.mimeType,
      size: media.size,
      bucketSlug: bucket.slug,
      folder: media.folder ?? "",
      width: media.imageMeta?.width ?? null,
      height: media.imageMeta?.height ?? null,
      // Ham byte kısa URL'i (kalite parametresiz orijinal). Mobil viewer bunu
      // doğrudan (anonim) çeker — image/video/pdf/txt.
      fileUrl: `/f/${media.id}`,
    },
  })
}
