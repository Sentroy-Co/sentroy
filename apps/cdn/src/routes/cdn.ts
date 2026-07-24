import { Router, Request, Response, NextFunction, RequestHandler } from 'express'
import multer from 'multer'
import mongoose from 'mongoose'
import Media, { IMediaModel } from '../models/Media'
import {
  uploadToS3,
  deleteFromS3,
  listS3Keys,
  deleteManyFromS3,
  setS3ObjectAcl,
} from '../services/s3'
import {
  processImage,
  generateThumbnails,
  generatePreviewThumbnailsFromRaster,
} from '../services/image'
import { convertPdfToPng, convertVideoToFirstFrame } from '../services/convert'
import {
  transcodeVideoSingle,
  generateVideoVariants,
  VIDEO_HEIGHT_LADDER,
  probeVideo,
} from '../services/video'
import { analyzeAudio } from '../services/audio'
import { authMiddleware } from '../middleware/auth'
import { serializeMedia } from '../lib/urls'

/**
 * Admin-facing CDN routes. Every handler requires the `x-cdn-secret` header
 * plus `x-company-id` and (for upload/list/delete) `x-bucket-id`. The
 * consuming app (apps/storage) validates the caller's access to the bucket
 * before proxying — this layer trusts the scope headers.
 *
 * S3 keys live under `{bucketId}/...` so buckets are physically isolated
 * and can be bulk-deleted via a single prefix sweep if ever needed.
 *
 * Public file reads live at `/f/:mediaId[/:quality]` (see routes/file.ts)
 * and don't pass through this router.
 */

const router = Router()

/**
 * Yüklenebilecek tek bir dosyanın bayt limiti. Env override edilebilir
 * (ör. plana özel limit istiyorsak deploy başına farklılaştırırız).
 * Storage app aynı sabiti consume edip UI tarafında pre-validate eder.
 */
export const MAX_UPLOAD_BYTES = parseInt(
  process.env.CDN_MAX_UPLOAD_BYTES || `${500 * 1024 * 1024}`,
  10,
)

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
})

/**
 * Multer multipart parsing sırasında attığı hatalar (özellikle
 * `LIMIT_FILE_SIZE`) eskiden yakalanmıyordu — `try/catch` route handler'ı
 * çalışmadan tetiklendiği için Express'in default error handler'ı 500
 * döndürüyordu. Bu wrapper multer middleware'ini sarar, MulterError
 * gelirse istemcinin handle edebileceği yapıda bir JSON ile yanıtlar.
 */
function uploadSingle(field: string): RequestHandler {
  const middleware = upload.single(field)
  return (req: Request, res: Response, next: NextFunction) => {
    middleware(req, res, (err: unknown) => {
      if (!err) return next()
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({
            error: 'File too large',
            code: 'LIMIT_FILE_SIZE',
            maxBytes: MAX_UPLOAD_BYTES,
            maxBytesHuman: formatBytes(MAX_UPLOAD_BYTES),
          })
          return
        }
        res.status(400).json({
          error: err.message || 'Upload rejected',
          code: err.code,
        })
        return
      }
      next(err)
    })
  }
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 200)
}

function requireBucket(
  req: Request,
  res: Response,
): { bucketId: string; companyId: string } | null {
  const bucketId = (req as any).bucketId as string | undefined
  const companyId = (req as any).companyId as string | undefined
  if (!bucketId) {
    res.status(400).json({ error: 'Missing x-bucket-id header' })
    return null
  }
  return { bucketId, companyId: companyId! }
}

/**
 * POST /cdn/upload
 * Multipart. S3 key becomes `{bucketId}/{folder}/{timestamp}-{sanitized}`.
 * Images are compressed + receive a thumbnail ladder; everything else
 * uploads as-is.
 */
router.post(
  '/upload',
  authMiddleware,
  uploadSingle('file'),
  async (req: Request, res: Response) => {
    try {
      const scope = requireBucket(req, res)
      if (!scope) return
      const { bucketId, companyId } = scope

      const file = req.file
      if (!file) {
        res.status(400).json({ error: 'No file provided' })
        return
      }

      const userId = (req as any).userId as string | undefined
      if (!userId) {
        res.status(400).json({ error: 'Missing x-user-id header' })
        return
      }

      const folderType = (req.body.folderType as string) || 'uploads'
      const isPublic = req.body.public === 'true'
      const alt = req.body.alt as string | undefined
      const caption = req.body.caption as string | undefined
      const tagsRaw = req.body.tags as string | undefined
      // Video knobs — both default off so the cheap pass-through path
      // stays the default. UI can opt either or both in.
      //   `compressVideo`  → single-pass H.264 re-encode at source
      //                      resolution (~30–60% smaller, ~real-time).
      //   `transcodeVideo` → full 144/480/720/1080 ladder. Slow.
      // When `transcodeVideo` is on we always run the compression
      // pass too, since each ladder rung is itself a re-encode and a
      // standalone compressed original gives consumers a sane
      // "original quality" download.
      const compressVideo = req.body.compressVideo === 'true'
      const transcodeVideo = req.body.transcodeVideo === 'true'

      const timestamp = Date.now()
      const sanitizedName = sanitizeFilename(file.originalname)
      /**
       * `fileName` is the path *inside* the bucket. We persist it as the
       * bucket-relative path (no `{bucketId}/` prefix) and reconstruct the
       * full S3 key on read/write. That way the model stays portable if a
       * bucket is ever renamed or re-homed.
       */
      let relativeName = `${folderType}/${timestamp}-${sanitizedName}`

      const looksLikeHeif =
        /^image\/hei[cf]/i.test(file.mimetype) ||
        /\.(heic|heif)$/i.test(file.originalname)
      const isImage = file.mimetype.startsWith('image/') || looksLikeHeif

      let finalBuffer = file.buffer
      let finalMimeType = file.mimetype
      let imageMeta: any = undefined
      let videoMeta: any = undefined
      let audioMeta: any = undefined

      if (isImage && file.mimetype !== 'image/svg+xml') {
        const processed = await processImage(file.buffer, file.mimetype)
        finalBuffer = processed.buffer
        finalMimeType = processed.mimeType
        imageMeta = processed.meta

        if (processed.convertedFromHeif) {
          relativeName = relativeName.replace(/\.(heic|heif)$/i, '.png')
          if (!/\.(png|jpe?g|webp)$/i.test(relativeName)) {
            relativeName = `${relativeName}.png`
          }
        }

        const fullKey = `${bucketId}/${relativeName}`
        await uploadToS3(fullKey, finalBuffer, finalMimeType, isPublic)

        imageMeta.thumbnails = await generateThumbnails(
          processed.decodedBuffer,
          fullKey,
          imageMeta.width,
          imageMeta.height,
          isPublic,
        )
      } else {
        const isPdf = finalMimeType === 'application/pdf'
        const isVideo = finalMimeType.startsWith('video/')
        const isAudio = finalMimeType.startsWith('audio/')

        // Video pre-process — happens *before* the source upload so
        // the bytes we write to S3 as the "original" are already
        // optimized. Skip on raw pass-through (both flags off) or
        // on container types ffmpeg doesn't reliably handle (only
        // text-based; mp4/mov/webm/mkv are all fine).
        if (isVideo && (compressVideo || transcodeVideo)) {
          try {
            const compressed = await transcodeVideoSingle(finalBuffer)
            finalBuffer = compressed
            // Force `.mp4` extension on the persisted key — the new
            // bytes are H.264/AAC mp4 regardless of source container.
            relativeName = relativeName.replace(/\.[^./\\]+$/, '') + '.mp4'
            finalMimeType = 'video/mp4'
          } catch (err) {
            console.warn(
              '[upload] video compression failed, falling back to raw upload:',
              err instanceof Error ? err.message : err,
            )
          }
        }

        const fullKey = `${bucketId}/${relativeName}`
        await uploadToS3(fullKey, finalBuffer, finalMimeType, isPublic)

        // PDF / video: best-effort preview thumbnail. Source dosyası raster'a
        // dönüştürülür (PDF → 1. sayfa PNG, video → 1. frame PNG), sonra image
        // pipeline'ındaki ladder'la 125/250/500 JPEG variantları S3'e yazılır.
        // Tüm bu adımlar opsiyoneldir — başarısız olsa bile orijinal upload
        // kayıttan düşmez. UI tarafı `imageMeta.thumbnails` mevcutsa otomatik
        // olarak bu variantları `<img src=".../125">` üzerinden render eder.
        if (isPdf || isVideo) {
          try {
            const raster = isPdf
              ? await convertPdfToPng(finalBuffer, 1)
              : await convertVideoToFirstFrame(finalBuffer)
            imageMeta = await generatePreviewThumbnailsFromRaster(
              raster.buffer,
              fullKey,
              isPublic,
            )
          } catch (err) {
            // Preview thumbnail hatası upload'ı bozmaz — sadece logla.
            console.warn(
              `[upload] preview thumbnail generation failed for ${fullKey}:`,
              err instanceof Error ? err.message : err,
            )
          }
        }

        // Audio: BPM + duration + channel probe (synchronous; tipik
        // 3-5 dakikalık şarkı ~1-2s sürer). Sentroy Studio DJ editor
        // bu metadata'yı doğrudan media doc'tan okur — browser'da
        // re-decode + autocorrelation pass'ini tamamen bypass eder.
        // Analiz başarısız olursa (sessiz dosya, codec sorunu) doc
        // yine yazılır; consumer kendi in-browser detector'una düşer.
        if (isAudio) {
          try {
            audioMeta = await analyzeAudio(finalBuffer)
          } catch (err) {
            console.warn(
              `[upload] audio analysis failed for ${fullKey}:`,
              err instanceof Error ? err.message : err,
            )
          }
        }

        // Video variant ladder — async. We probe sync to compute
        // the rung count so the response carries an accurate
        // `processing.variantsTotal`, but the actual ffmpeg work
        // runs in `setImmediate` after the response goes out. The
        // background callback streams variant rows back into the
        // doc as each rung lands, so the UI can poll and watch the
        // count climb. Total upload latency drops from
        // "transcode-bound" to "compress-bound" (or instant if
        // compression also disabled).
        if (isVideo && transcodeVideo) {
          try {
            const probe = await probeVideo(finalBuffer)
            const targets = VIDEO_HEIGHT_LADDER.filter(
              (h) => h <= probe.height,
            )
            videoMeta = {
              width: probe.width,
              height: probe.height,
              duration: probe.duration,
              variants: [],
            }
            // Caller of this scope sets the doc's `processing` field
            // below — we stash the planned total here so it's
            // included on insert.
            ;(videoMeta as any).__plannedVariants = targets.length
          } catch (err) {
            console.warn(
              `[upload] video probe failed for ${fullKey}:`,
              err instanceof Error ? err.message : err,
            )
          }
        }
      }

      const mediaType = (Media as IMediaModel).getFileType(finalMimeType)

      // Detach the temp planning marker we attached above before
      // persisting — schema doesn't know about it.
      const plannedVariants =
        (videoMeta as { __plannedVariants?: number } | undefined)
          ?.__plannedVariants
      if (videoMeta && plannedVariants !== undefined) {
        delete (videoMeta as { __plannedVariants?: number }).__plannedVariants
      }

      const isAsyncTranscode =
        finalMimeType.startsWith('video/') &&
        transcodeVideo &&
        plannedVariants !== undefined &&
        plannedVariants > 0
      const processing = isAsyncTranscode
        ? {
            status: 'queued' as const,
            variantsTotal: plannedVariants,
            variantsCompleted: 0,
            startedAt: new Date(),
          }
        : undefined

      const doc = await Media.create({
        bucketId,
        companyId,
        fileName: relativeName,
        originalName: file.originalname,
        type: mediaType,
        size: finalBuffer.length,
        mimeType: finalMimeType,
        folder: folderType,
        uploadedBy: userId,
        isPublic,
        alt,
        caption,
        tags: tagsRaw
          ? tagsRaw
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
          : [],
        imageMeta,
        videoMeta,
        audioMeta,
        processing,
      })

      // Send the response BEFORE kicking off transcoding. The
      // browser sees a successful upload immediately; the UI will
      // poll the media doc to see ladder rungs land one by one.
      res.json({ success: true, media: serializeMedia(doc) })

      if (isAsyncTranscode) {
        const docId = doc._id
        const fullKey = `${bucketId}/${relativeName}`
        const sourceBuffer = finalBuffer
        // Detach via setImmediate so any await above (Mongo ack,
        // res flush) settles before ffmpeg starts saturating CPU.
        setImmediate(async () => {
          try {
            await Media.updateOne(
              { _id: docId },
              { $set: { 'processing.status': 'processing' } },
            )
            const result = await generateVideoVariants(
              sourceBuffer,
              fullKey,
              isPublic,
              {
                onVariantReady: async (v) => {
                  // Stream each rung into the doc as it lands so
                  // the polling UI can flip it from "processing"
                  // into the variant picker without waiting for
                  // the whole ladder.
                  await Media.updateOne(
                    { _id: docId },
                    {
                      $push: { 'videoMeta.variants': v },
                      $inc: { 'processing.variantsCompleted': 1 },
                    },
                  )
                },
              },
            )
            await Media.updateOne(
              { _id: docId },
              {
                $set: {
                  'videoMeta.width': result?.width ?? 0,
                  'videoMeta.height': result?.height ?? 0,
                  'videoMeta.duration': result?.duration ?? 0,
                  'processing.status': 'completed',
                  'processing.completedAt': new Date(),
                },
              },
            )
          } catch (err) {
            console.error(
              `[upload] async transcode failed for ${fullKey}:`,
              err,
            )
            await Media.updateOne(
              { _id: docId },
              {
                $set: {
                  'processing.status': 'failed',
                  'processing.error':
                    err instanceof Error ? err.message : String(err),
                  'processing.completedAt': new Date(),
                },
              },
            ).catch(() => {})
          }
        })
      }
      return
    } catch (error: any) {
      console.error('Upload error:', error)
      res.status(500).json({ error: 'Upload failed', details: error.message })
    }
  },
)

/**
 * GET /cdn/list
 * Bucket-scoped listing. Accepts: folder, type, search, limit (1..100),
 * offset. All filters layer onto the bucketId scope from the header.
 */
router.get('/list', authMiddleware, async (req: Request, res: Response) => {
  try {
    const scope = requireBucket(req, res)
    if (!scope) return
    const { bucketId } = scope

    const folder = typeof req.query.folder === 'string' ? req.query.folder : undefined
    const type = typeof req.query.type === 'string' ? req.query.type : undefined
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''
    const limit = clamp(parseInt((req.query.limit as string) || '30', 10), 1, 100, 30)
    const offset = Math.max(parseInt((req.query.offset as string) || '0', 10) || 0, 0)

    const filter: Record<string, unknown> = { bucketId }
    if (folder) filter.folder = folder
    if (type && ['image', 'video', 'audio', 'document', 'other'].includes(type)) {
      filter.type = type
    }
    if (search) {
      filter.originalName = { $regex: escapeRegex(search), $options: 'i' }
    }

    const [docs, total] = await Promise.all([
      Media.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit).lean<any[]>(),
      Media.countDocuments(filter),
    ])

    res.json({
      success: true,
      items: docs.map((d) => serializeMedia(d)),
      total,
      limit,
      offset,
    })
  } catch (error: any) {
    console.error('List error:', error)
    res.status(500).json({ error: 'List failed', details: error.message })
  }
})

/**
 * DELETE /cdn/file
 * Body: { mediaId }. Must resolve to a media doc whose bucketId matches
 * the caller's `x-bucket-id`. Removes the DB record, the original S3
 * object, and every thumbnail variant.
 */
router.delete('/file', authMiddleware, async (req: Request, res: Response) => {
  try {
    const scope = requireBucket(req, res)
    if (!scope) return
    const { bucketId } = scope

    const { mediaId } = req.body as { mediaId?: string }

    if (!mediaId) {
      res.status(400).json({ error: 'mediaId is required' })
      return
    }

    const doc = await Media.findById(mediaId)
    if (!doc || doc.bucketId !== bucketId) {
      res.status(404).json({ error: 'Media not found' })
      return
    }

    // Sweep every S3 object the doc tracks: the original, image
    // thumbnail variants, and (new) video transcode variants. All
    // three follow the same `fileName = full S3 key` convention so
    // the same Promise.allSettled fan-out covers them.
    const keys = [`${doc.bucketId}/${doc.fileName}`]
    for (const t of doc.imageMeta?.thumbnails ?? []) {
      keys.push(t.fileName)
    }
    for (const v of doc.videoMeta?.variants ?? []) {
      keys.push(v.fileName)
    }

    const results = await Promise.allSettled(keys.map((k) => deleteFromS3(k)))
    const failed = results
      .map((r, i) => (r.status === 'rejected' ? keys[i] : null))
      .filter(Boolean) as string[]

    // Yalnızca tüm S3 key'leri temizlendiyse doc'u sil. Kısmi fail'de
    // doc kalsın — tekrar deneme mümkün olsun, orphan oluşmasın.
    if (failed.length === 0) {
      await doc.deleteOne()
    }

    res.json({
      success: failed.length === 0,
      mediaId,
      deleted: keys.filter((_, i) => results[i].status === 'fulfilled'),
      failed,
      docDeleted: failed.length === 0,
    })
  } catch (error: any) {
    console.error('Delete error:', error)
    res.status(500).json({ error: 'Delete failed' })
  }
})

/**
 * DELETE /cdn/bucket
 * Bucket'ın içindeki tüm dosyaları tek seferde temizler — S3'ten prefix'li
 * liste çekilir, `DeleteObjects` (max 1000/chunk) ile toplu silinir, sonra
 * Media `deleteMany({ bucketId })` çalıştırılır.
 *
 * Consuming app bu çağrıdan *önce* bucket'ın silinebilir olduğunu doğrular
 * (owner/admin yetkisi vb.) ve *sonra* kendi bucket dokümanını düşürür.
 */
router.delete('/bucket', authMiddleware, async (req: Request, res: Response) => {
  try {
    const scope = requireBucket(req, res)
    if (!scope) return
    const { bucketId } = scope

    const prefix = `${bucketId}/`
    const keys = await listS3Keys(prefix)

    const s3Result =
      keys.length > 0
        ? await deleteManyFromS3(keys)
        : { deleted: [] as string[], failed: [] as string[] }

    // Kısmi başarısızlıkta Media dokümanını de silmek orphan yaratır:
    // DB sileriz ama S3'te object hala durur → kimsenin göremediği ama
    // faturalanan çöp. Önleme stratejisi: sadece tüm S3 key'leri (original
    // + thumbnail'lar) başarıyla silinen dokümanları DB'den kaldır. Kalan
    // orphan docs'lar bir sonraki retry'da tekrar denenebilir.
    const failedSet = new Set(s3Result.failed)
    let docsDeleted = 0
    let docsRemaining = 0

    if (failedSet.size === 0) {
      // Happy path: tüm S3 temiz → toplu DB sil
      const r = await Media.deleteMany({ bucketId })
      docsDeleted = r.deletedCount ?? 0
    } else {
      // Doc-level eşleştirme: her doc'un hiçbir key'i failed'da olmamalı
      const docs = await Media.find({ bucketId }).lean<any[]>()
      const safeToDelete: string[] = []
      for (const doc of docs) {
        const docKeys = [`${doc.bucketId}/${doc.fileName}`]
        for (const t of doc.imageMeta?.thumbnails ?? []) {
          if (t.fileName) docKeys.push(t.fileName)
        }
        for (const v of doc.videoMeta?.variants ?? []) {
          if (v.fileName) docKeys.push(v.fileName)
        }
        const hasFailed = docKeys.some((k) => failedSet.has(k))
        if (!hasFailed) safeToDelete.push(doc._id.toString())
        else docsRemaining++
      }
      if (safeToDelete.length > 0) {
        const r = await Media.deleteMany({
          bucketId,
          _id: { $in: safeToDelete.map((id) => new mongoose.Types.ObjectId(id)) },
        })
        docsDeleted = r.deletedCount ?? 0
      }
    }

    res.json({
      success: s3Result.failed.length === 0,
      s3Deleted: s3Result.deleted.length,
      s3Failed: s3Result.failed,
      docsDeleted,
      docsRemaining,
    })
  } catch (error: any) {
    console.error('Bucket purge error:', error)
    res.status(500).json({ error: 'Bucket purge failed', details: error.message })
  }
})

/**
 * PATCH /cdn/bucket/visibility
 * Body: `{ isPublic: boolean }`. Bucket içindeki mevcut tüm S3 objelerinin
 * ACL'ini toplu günceller. DB dokümanları (`Media.isPublic`) de aynı anda
 * set edilir ki serialize edilen URL'ler tutarlı kalsın.
 *
 * İşlem büyük bucket'ta uzun sürer: consuming app ya UI'da progress gösterir
 * ya da bu çağrıyı async queue'ya iter. Şimdilik senkron çalışır; `PutAcl`
 * concurrent olarak (pool = 10) gönderilir.
 */
router.patch('/bucket/visibility', authMiddleware, async (req: Request, res: Response) => {
  try {
    const scope = requireBucket(req, res)
    if (!scope) return
    const { bucketId } = scope

    const body = req.body as { isPublic?: boolean }
    if (typeof body.isPublic !== 'boolean') {
      res.status(400).json({ error: 'isPublic (boolean) is required' })
      return
    }
    const isPublic: boolean = body.isPublic

    const prefix = `${bucketId}/`
    const keys = await listS3Keys(prefix)

    const POOL = 10
    let cursor = 0
    const failed: string[] = []
    async function worker() {
      while (cursor < keys.length) {
        const i = cursor++
        const key = keys[i]
        if (!key) continue
        try {
          await setS3ObjectAcl(key, isPublic)
        } catch {
          failed.push(key)
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(POOL, keys.length) }, worker))

    const docResult = await Media.updateMany(
      { bucketId },
      { $set: { isPublic } },
    )

    res.json({
      success: failed.length === 0,
      s3Updated: keys.length - failed.length,
      s3Failed: failed,
      docsUpdated: docResult.modifiedCount ?? 0,
    })
  } catch (error: any) {
    console.error('Visibility toggle error:', error)
    res.status(500).json({ error: 'Visibility toggle failed', details: error.message })
  }
})

function clamp(n: number, min: number, max: number, fallback: number): number {
  if (Number.isNaN(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * POST /cdn/replace/:mediaId  (multipart, field `file`)
 * Mevcut bir dosyanın S3 içeriğini in-place OVERWRITE eder — kod/metin
 * editörü "kaydet" akışı. Key/fileName DEĞİŞMEZ (public `/f/:id` URL'i sabit).
 * Boyut güncellenir; varsa eski variant/converted cache objeleri süpürülür.
 * Scope: media.bucketId, x-bucket-id header'ıyla eşleşmeli.
 */
router.post('/replace/:mediaId', authMiddleware, uploadSingle('file'), async (req: Request, res: Response) => {
  try {
    const scope = requireBucket(req, res)
    if (!scope) return
    const mediaId = String(req.params.mediaId || '')
    if (!mongoose.Types.ObjectId.isValid(mediaId)) {
      res.status(400).json({ error: 'Invalid media id' })
      return
    }
    const file = req.file
    if (!file) {
      res.status(400).json({ error: 'No file' })
      return
    }
    const doc = await Media.findById(mediaId)
    if (!doc) {
      res.status(404).json({ error: 'Media not found' })
      return
    }
    if (String(doc.bucketId) !== String(scope.bucketId)) {
      res.status(403).json({ error: 'Bucket scope mismatch' })
      return
    }
    // S3 key sabit — overwrite. mimeType korunur (metin/kod dosyası).
    const key = `${doc.bucketId}/${doc.fileName}`
    await uploadToS3(key, file.buffer, doc.mimeType || file.mimetype || 'text/plain', doc.isPublic)
    doc.size = file.buffer.length
    await doc.save()

    // Eski türetilmiş cache'leri temizle (metinde genelde yok; garanti için).
    try {
      const base = doc.fileName.replace(/\.[^./]+$/, '')
      const stale = [
        ...(await listS3Keys(`${doc.bucketId}/_converted/${doc.fileName}`)),
        ...(await listS3Keys(`${doc.bucketId}/_variants/${base}_`)),
      ]
      if (stale.length) await deleteManyFromS3(stale)
    } catch (e) {
      console.warn('[cdn/replace] cache sweep failed', (e as Error)?.message)
    }

    res.json({ success: true, media: serializeMedia(doc) })
  } catch (err) {
    console.error('[cdn/replace] error', err)
    res.status(500).json({ error: 'Replace failed' })
  }
})

export default router
