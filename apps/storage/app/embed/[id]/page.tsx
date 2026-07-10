import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { bucketModel, mediaModel } from "@workspace/db/models"
import { isSystemManagedBucketSlug } from "@workspace/db/constants"
import { EmbedPlayer } from "@/components/embed/embed-player"

/**
 * Public embeddable player at `/embed/<mediaId>`. Mirrors the auth
 * model of `/f/<mediaId>` — only public-bucket + public-media combos
 * resolve, anything else 404s. The page is rendered without any
 * dashboard chrome, sized to fill its iframe parent, so consumers
 * can drop a YouTube-style `<iframe>` snippet on their own site.
 *
 * Embed code shape (copied from the storage UI):
 *
 *   <iframe
 *     src="https://storage.sentroy.com/embed/<mediaId>"
 *     width="640" height="360" frameborder="0"
 *     allow="autoplay; fullscreen; picture-in-picture"
 *     allowfullscreen
 *   ></iframe>
 *
 * Audio embeds use a smaller default (e.g. 600x180); the consumer
 * sets the `<iframe>` dimensions, the player just fills.
 */

export const dynamic = "force-dynamic"

interface EmbedPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * YouTube-style embed URL params. Caller (storage UI's embed
 * builder dialog) builds the iframe `src` from these.
 *
 *   ?autoplay=1   start playback on load (browsers force-mute)
 *   ?loop=1       wrap-around at end
 *   ?muted=1      start muted
 *   ?start=42     jump to N seconds on load
 *   ?controls=0   hide all chrome (transport bar, center cluster)
 */
function parsePlayerInit(
  sp: Record<string, string | string[] | undefined>,
): NonNullable<Parameters<typeof EmbedPlayer>[0]["item"]["playerInit"]> {
  const get = (k: string) => {
    const v = sp[k]
    return Array.isArray(v) ? v[0] : v
  }
  const isOn = (v: string | undefined) => v === "1" || v === "true"
  const start = Number(get("start"))
  return {
    autoplay: isOn(get("autoplay")),
    loop: isOn(get("loop")),
    muted: isOn(get("muted")),
    hideControls: get("controls") === "0",
    start: Number.isFinite(start) && start > 0 ? start : undefined,
  }
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
}: EmbedPageProps): Promise<Metadata> {
  const { id } = await params
  const data = await loadMedia(id)
  if (!data) return { title: "Sentroy" }
  return {
    title: data.media.originalName,
    description: data.media.caption ?? undefined,
    // Allow embedding everywhere — these pages are designed to live
    // inside arbitrary iframes. The default `same-origin` referrer
    // policy is fine; we don't strip it to anonymous so the CDN can
    // see who's hot-linking for analytics.
    other: {
      "x-frame-options": "ALLOWALL",
    },
  }
}

export default async function EmbedPage({
  params,
  searchParams,
}: EmbedPageProps) {
  const { id } = await params
  const sp = await searchParams
  const data = await loadMedia(id)
  if (!data) notFound()

  const { media } = data
  const playerInit = parsePlayerInit(sp)

  // The CDN serves variants over the same `/f/:mediaId/:quality`
  // contract the dashboard uses. Pre-pack the full ladder so the
  // embedded video player has the same quality picker users get
  // inside the dashboard lightbox.
  const baseUrl = `/f/${media.id}`
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

  return (
    <EmbedPlayer
      item={{
        id: media.id,
        url: baseUrl,
        name: media.originalName,
        mimeType: media.mimeType,
        size: media.size,
        variants: variants.length > 0 ? variants : undefined,
        playerInit,
      }}
      kind={media.type === "audio" ? "audio" : "video"}
    />
  )
}
