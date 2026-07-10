import sharp from 'sharp'
import heicConvert from 'heic-convert'
import type { IImageMeta, IThumbnail } from '../models/Media'
import { uploadToS3 } from './s3'

/**
 * Thumbnail widths published by the CDN. Consumers request variants by
 * width in their URLs (`/f/:mediaId/500`), so any width not in this list
 * will 404 at serve time — even if the original is big enough. Keep the
 * set reasonable: every added size multiplies upload cost (decode +
 * resize + S3 PUT) per image.
 *
 * Widths must be listed ascending so the serve-time "smallest variant
 * that meets the request" lookup is deterministic.
 */
export const THUMBNAIL_WIDTHS = [125, 250, 500, 1000, 2000] as const
export type ThumbnailWidth = (typeof THUMBNAIL_WIDTHS)[number]

interface ProcessedImage {
  buffer: Buffer
  meta: IImageMeta
  mimeType: string
  /** Master RGB buffer used for any downstream decode (e.g. thumbnails). */
  decodedBuffer: Buffer
  /** True when the upload arrived as HEIF/HEIC and was transcoded to PNG. */
  convertedFromHeif: boolean
}

function getOrientation(width: number, height: number): 'landscape' | 'portrait' | 'square' {
  if (width > height) return 'landscape'
  if (height > width) return 'portrait'
  return 'square'
}

// -----------------------------------------------------------------------------
// HEIF handling
// -----------------------------------------------------------------------------

const HEIF_MIME_TYPES = new Set<string>([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
])

/**
 * Magic-byte sniff for HEIF/HEIC containers. Many browsers/clients (especially
 * iOS Safari) tag HEIC uploads as `application/octet-stream`, so we can't rely
 * on the mime type alone.
 */
function isHeifBuffer(buffer: Buffer): boolean {
  if (buffer.length < 12) return false
  if (buffer.slice(4, 8).toString('ascii') !== 'ftyp') return false
  const brand = buffer.slice(8, 12).toString('ascii')
  // Common HEIF / HEVC / MIAF brands
  return ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'heis', 'heim', 'heip'].includes(brand)
}

/**
 * Decode a HEIF/HEIC buffer into a PNG buffer using the pure-JS `heic-convert`
 * so we don't depend on libheif being compiled into sharp. PNG is preferred
 * over JPEG to preserve quality before sharp's final compression pass.
 */
async function decodeHeifToPng(buffer: Buffer): Promise<Buffer> {
  // Pass a tight Uint8Array view of the original bytes. A naive
  // `new Uint8Array(buffer)` would COPY the Buffer's underlying ArrayBuffer
  // INCLUDING Node's pool offset, producing garbage data for pooled buffers.
  const view = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  const converted = await heicConvert({
    buffer: view as any,
    format: 'PNG',
  })
  return Buffer.from(converted)
}

/**
 * Returns a sharp-safe buffer + its effective mime type. If the input is HEIF
 * (by mime OR by magic bytes) it is transcoded to PNG first. For anything
 * else the input is passed through unchanged.
 */
async function ensureSharpReadable(
  buffer: Buffer,
  mimeType: string
): Promise<{ buffer: Buffer; mimeType: string; convertedFromHeif: boolean }> {
  const heif =
    HEIF_MIME_TYPES.has(mimeType) ||
    (mimeType === 'application/octet-stream' && isHeifBuffer(buffer)) ||
    isHeifBuffer(buffer)
  if (!heif) {
    return { buffer, mimeType, convertedFromHeif: false }
  }

  try {
    const pngBuffer = await decodeHeifToPng(buffer)
    return { buffer: pngBuffer, mimeType: 'image/png', convertedFromHeif: true }
  } catch (err) {
    console.error('[image] HEIF decode failed:', err)
    throw new Error('HEIF/HEIC decoding failed')
  }
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Process an image: compress without visible quality loss and extract metadata.
 * Transparently handles HEIF/HEIC by pre-decoding to PNG before passing the
 * buffer to sharp.
 */
export async function processImage(
  inputBuffer: Buffer,
  mimeType: string
): Promise<ProcessedImage> {
  const decoded = await ensureSharpReadable(inputBuffer, mimeType)
  const workingBuffer = decoded.buffer
  const effectiveMime = decoded.mimeType

  const image = sharp(workingBuffer).rotate() // auto-rotate based on EXIF
  const metadata = await image.metadata()
  const width = metadata.width || 0
  const height = metadata.height || 0

  let compressed: Buffer
  let outputMimeType = effectiveMime

  if (effectiveMime === 'image/png') {
    compressed = await image.png({ quality: 85, compressionLevel: 9 }).toBuffer()
    outputMimeType = 'image/png'
  } else if (effectiveMime === 'image/webp') {
    compressed = await image.webp({ quality: 82 }).toBuffer()
    outputMimeType = 'image/webp'
  } else if (effectiveMime === 'image/gif') {
    // Don't reprocess GIFs (animation)
    compressed = workingBuffer
  } else {
    // Default: JPEG
    compressed = await image.jpeg({ quality: 85, mozjpeg: true }).toBuffer()
    outputMimeType = 'image/jpeg'
  }

  return {
    buffer: compressed,
    meta: {
      width,
      height,
      orientation: getOrientation(width, height),
      thumbnails: [],
    },
    mimeType: outputMimeType,
    decodedBuffer: workingBuffer,
    convertedFromHeif: decoded.convertedFromHeif,
  }
}

/**
 * Generate thumbnails at predefined widths and upload them to S3.
 * Thumbnail key: same path as original with _125 / _500 suffix before extension.
 * Accepts either the raw upload buffer or an already-decoded buffer; HEIF
 * inputs are transparently decoded to PNG before resizing.
 */
export async function generateThumbnails(
  inputBuffer: Buffer,
  originalKey: string,
  originalWidth: number,
  originalHeight: number,
  isPublic: boolean
): Promise<IThumbnail[]> {
  return generateThumbnailLadder(inputBuffer, originalKey, originalWidth, originalHeight, isPublic)
}

/**
 * Non-image (PDF/video) preview pipeline. Caller pre-rasterizes the source
 * to a PNG buffer (e.g. `convertPdfToPng` for the first page,
 * `convertVideoToFirstFrame` for the first frame); we then run the same
 * thumbnail ladder logic. Result populates `imageMeta` on the Media doc so
 * existing `<img src=".../:width">` URLs work transparently for PDF/video
 * thumbnails.
 *
 * `originalKey` is the *source* file's S3 key — thumbnail keys derive from
 * it (`{base}_125.jpg`, etc.), keeping cleanup simple: deleting the source
 * record sweeps `imageMeta.thumbnails[].fileName` like any image.
 *
 * Always emits at least the smallest variant in `THUMBNAIL_WIDTHS` even
 * when the source is smaller — for low-res PDFs/videos we still want a
 * usable inline preview rather than a blank fallback icon.
 */
export async function generatePreviewThumbnailsFromRaster(
  pngBuffer: Buffer,
  originalKey: string,
  isPublic: boolean
): Promise<IImageMeta | null> {
  try {
    const pipeline = sharp(pngBuffer).rotate()
    const meta = await pipeline.metadata()
    const width = meta.width || 0
    const height = meta.height || 0
    if (width === 0 || height === 0) return null

    const thumbs = await generateThumbnailLadder(
      pngBuffer,
      originalKey,
      width,
      height,
      isPublic,
      // PDF/video kaynakları küçük render edilip de "thumb yok" durumuna
      // düşmesin diye en küçük variant'ı zorla emit et.
      { forceSmallest: true }
    )

    return {
      width,
      height,
      orientation: getOrientation(width, height),
      thumbnails: thumbs,
    }
  } catch (err) {
    console.error('[image] preview thumbnail generation failed:', err)
    return null
  }
}

async function generateThumbnailLadder(
  inputBuffer: Buffer,
  originalKey: string,
  originalWidth: number,
  originalHeight: number,
  isPublic: boolean,
  opts: { forceSmallest?: boolean } = {}
): Promise<IThumbnail[]> {
  const thumbnails: IThumbnail[] = []

  // Ensure sharp can read it (HEIF → PNG). Mime is best-guessed as octet-stream
  // since callers don't always pass it here.
  const decoded = await ensureSharpReadable(inputBuffer, 'application/octet-stream')
  const workingBuffer = decoded.buffer

  const dotIdx = originalKey.lastIndexOf('.')
  const basePath = dotIdx > -1 ? originalKey.substring(0, dotIdx) : originalKey
  const ext = dotIdx > -1 ? originalKey.substring(dotIdx) : '.jpg'

  const smallestWidth = THUMBNAIL_WIDTHS[0]
  for (const targetWidth of THUMBNAIL_WIDTHS) {
    const isSmallest = targetWidth === smallestWidth
    const skip = originalWidth <= targetWidth && !(opts.forceSmallest && isSmallest)
    if (skip) continue

    const ratio = originalHeight / originalWidth
    const targetHeight = Math.round(targetWidth * ratio)

    const thumbBuffer = await sharp(workingBuffer)
      .rotate()
      .resize(targetWidth, targetHeight, { fit: 'inside', withoutEnlargement: !opts.forceSmallest || !isSmallest })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer()

    const thumbKey = `${basePath}_${targetWidth}${ext === '.png' || ext === '.webp' ? ext : '.jpg'}`

    await uploadToS3(thumbKey, thumbBuffer, 'image/jpeg', isPublic)

    thumbnails.push({
      width: targetWidth,
      height: targetHeight,
      fileName: thumbKey,
      size: thumbBuffer.length,
    })
  }

  return thumbnails
}
