import type { IMedia } from '../models/Media'

/**
 * Public URL builder. `BASE_URL` is the CDN's externally-reachable origin
 * (e.g. https://cdn.example.com). Every URL the CDN emits follows the
 * `/f/:mediaId[/:quality]` shape so consumers never have to know about S3
 * keys, thumbnail suffixes, or the key-based query-string API.
 *
 * `quality` is either:
 *   - "original" — the main asset
 *   - a numeric width present in `imageMeta.thumbnails` (e.g. "500")
 *
 * Unknown qualities fall back to the original at serve time; the builder
 * here is permissive on purpose so responses can reference planned sizes
 * even before their thumbnail generation completes.
 */

const FALLBACK_BASE = 'http://localhost:4100'

export function getBaseUrl(): string {
  const raw = (process.env.BASE_URL || FALLBACK_BASE).trim()
  return raw.replace(/\/+$/, '')
}

export type Quality = 'original' | number

export function buildFileUrl(mediaId: string, quality: Quality = 'original'): string {
  const q = quality === 'original' ? 'original' : String(quality)
  return `${getBaseUrl()}/f/${mediaId}/${q}`
}

export function buildDownloadUrl(
  mediaId: string,
  filename: string,
  quality: Quality = 'original',
): string {
  const base = buildFileUrl(mediaId, quality)
  const params = new URLSearchParams({ download: '1', filename })
  return `${base}?${params.toString()}`
}

/**
 * Serialize a Media doc for the wire. URLs are fully qualified; the S3 keys
 * stay on the server so consumers can't manipulate storage paths directly.
 */
export function serializeMedia(doc: IMedia) {
  const id = doc._id.toString()
  const thumbnails = (doc.imageMeta?.thumbnails ?? []).map((t) => ({
    width: t.width,
    height: t.height,
    size: t.size,
    url: buildFileUrl(id, t.width),
  }))
  const variants = (doc.videoMeta?.variants ?? []).map((v) => ({
    height: v.height,
    width: v.width,
    size: v.size,
    bitrate: v.bitrate,
    // Re-uses the same `/f/:mediaId/:quality` shape as image
    // thumbnails — `quality` is the height in pixels (`/720`,
    // `/480`). Caller routing layer (`routes/file.ts`) resolves
    // quality numbers against both image thumbnails and video
    // variants, so a single URL form covers both.
    url: buildFileUrl(id, v.height),
  }))

  return {
    mediaId: id,
    bucketId: doc.bucketId,
    companyId: doc.companyId,
    url: buildFileUrl(id, 'original'),
    downloadUrl: buildDownloadUrl(id, doc.originalName, 'original'),
    fileName: doc.fileName,
    originalName: doc.originalName,
    folder: doc.folder,
    type: doc.type,
    mimeType: doc.mimeType,
    size: doc.size,
    uploadedBy: doc.uploadedBy,
    isPublic: doc.isPublic,
    alt: doc.alt,
    caption: doc.caption,
    tags: doc.tags,
    imageMeta: doc.imageMeta
      ? {
          width: doc.imageMeta.width,
          height: doc.imageMeta.height,
          orientation: doc.imageMeta.orientation,
          thumbnails,
        }
      : undefined,
    videoMeta: doc.videoMeta
      ? {
          width: doc.videoMeta.width,
          height: doc.videoMeta.height,
          duration: doc.videoMeta.duration,
          variants,
        }
      : undefined,
    audioMeta: doc.audioMeta
      ? {
          duration: doc.audioMeta.duration,
          bpm: doc.audioMeta.bpm,
          sampleRate: doc.audioMeta.sampleRate,
          channels: doc.audioMeta.channels,
        }
      : undefined,
    processing: doc.processing
      ? {
          status: doc.processing.status,
          variantsTotal: doc.processing.variantsTotal,
          variantsCompleted: doc.processing.variantsCompleted,
          error: doc.processing.error,
          startedAt: doc.processing.startedAt,
          completedAt: doc.processing.completedAt,
        }
      : undefined,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

export type SerializedMedia = ReturnType<typeof serializeMedia>
