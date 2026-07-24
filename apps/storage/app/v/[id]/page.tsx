import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { bucketModel, mediaModel } from "@workspace/db/models"
import { isSystemManagedBucketSlug } from "@workspace/db/constants"
import { PublicViewer } from "@/components/viewer/public-viewer"

/**
 * Public shared-file viewer `/v/<mediaId>` — paylaşım linki hedefi. `/f/<id>`
 * ham byte servis ederken (img/embed/hotlink), `/v/<id>` zengin görüntüleyiciyi
 * (FilePreviewLightbox: player/pdf/txt/görsel) tam sayfa açar. Aynı public gate:
 * yalnız public-bucket + public-media çözülür; aksi 404.
 */

export const dynamic = "force-dynamic"

interface ViewerPageProps {
  params: Promise<{ id: string }>
}

async function loadMedia(id: string) {
  if (!id) return null
  const media = await mediaModel.findById(id)
  if (!media || !media.isPublic) return null
  const bucket = await bucketModel.findById(media.bucketId)
  if (!bucket || !bucket.isPublic) return null
  if (isSystemManagedBucketSlug(bucket.slug)) return null
  return { media, bucket }
}

export async function generateMetadata({
  params,
}: ViewerPageProps): Promise<Metadata> {
  const { id } = await params
  const data = await loadMedia(id)
  if (!data) return { title: "Sentroy Storage" }
  const { media } = data
  const isImage = media.type === "image"
  return {
    title: `${media.originalName} · Sentroy Storage`,
    description: media.caption ?? `Shared on Sentroy Storage`,
    openGraph: {
      title: media.originalName,
      description: media.caption ?? "Shared on Sentroy Storage",
      images: isImage ? [{ url: `/f/${media.id}?quality=1200` }] : undefined,
    },
  }
}

export default async function ViewerPage({ params }: ViewerPageProps) {
  const { id } = await params
  const data = await loadMedia(id)
  if (!data) notFound()

  const { media } = data
  const baseUrl = `/f/${media.id}`

  // Kalite merdivenini paketle (dashboard lightbox ile aynı picker).
  const variants: Array<{
    kind: "image" | "video"
    url: string
    label: string
    size?: number
  }> = []
  for (const t of media.imageMeta?.thumbnails ?? []) {
    variants.push({
      kind: "image",
      url: `${baseUrl}?quality=${t.width}`,
      label: `${t.width}w`,
      size: t.size,
    })
  }
  for (const v of media.videoMeta?.variants ?? []) {
    variants.push({
      kind: "video",
      url: `${baseUrl}?quality=${v.height}`,
      label: `${v.height}p`,
      size: v.size,
    })
  }

  const downloadUrl = `${baseUrl}?download=1&filename=${encodeURIComponent(
    media.originalName,
  )}`

  return (
    <PublicViewer
      item={{
        id: media.id,
        url: baseUrl,
        name: media.originalName,
        mimeType: media.mimeType,
        size: media.size,
        variants: variants.length > 0 ? variants : undefined,
      }}
      downloadUrl={downloadUrl}
      homeUrl="/"
    />
  )
}
