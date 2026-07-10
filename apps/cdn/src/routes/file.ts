import { Router, Request, Response } from 'express'
import Media from '../models/Media'
import { getFromS3, getObjectStream, uploadToS3, type S3ObjectStream } from '../services/s3'
import {
  convertImage,
  convertPdfToPng,
  convertVideoToFirstFrame,
  resizeImage,
  type ImageTargetFormat,
} from '../services/convert'
import { publicFileCorsHeaders } from '../lib/cors'

/**
 * Transform concurrency guard — Sharp/ffmpeg/pdftoppm (özellikle AVIF)
 * CPU-yoğun; 2-çekirdekli sunucuda sınırsız eşzamanlı transcode tüm servisi
 * kilitler. Aynı anda en fazla N transform; fazlası sıraya girer. Convert
 * sonuçları S3'e cache'lendiği için bir variant yalnız BİR kez transcode edilir.
 */
const MAX_CONCURRENT_TRANSFORMS = Number(process.env.CDN_MAX_TRANSFORMS || '2')
let activeTransforms = 0
const transformQueue: Array<() => void> = []
async function withTransformLimit<T>(fn: () => Promise<T>): Promise<T> {
  if (activeTransforms >= MAX_CONCURRENT_TRANSFORMS) {
    await new Promise<void>((resolve) => transformQueue.push(resolve))
  }
  activeTransforms++
  try {
    return await fn()
  } finally {
    activeTransforms--
    transformQueue.shift()?.()
  }
}

/**
 * Public file-serving route.
 *
 *   GET /f/:mediaId              → original
 *   GET /f/:mediaId/original     → original (explicit)
 *   GET /f/:mediaId/:width       → thumbnail matching that width, if it exists
 *                                  otherwise we fall back to the original
 *
 * Query params:
 *   - download=1         → Content-Disposition: attachment
 *   - filename=<name>    → custom attachment filename
 *
 * No auth: URLs are unguessable (ObjectId) and the upstream consumer decides
 * whether to expose them. When finer-grained control is needed, flip
 * `isPublic=false` on upload and have the consumer gate the URL itself.
 */

const router = Router()

function sanitizeFilename(name: unknown): string {
  const raw = typeof name === "string" ? name.trim() : ""
  const base = raw.length > 0 ? raw : "download"
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").substring(0, 200)
}

function isMissingKeyError(e: unknown): boolean {
  const err = e as { name?: string; message?: string; Code?: string }
  return (
    err?.name === 'NoSuchKey' ||
    err?.Code === 'NoSuchKey' ||
    err?.message === 'File not found'
  )
}

async function handleFile(req: Request, res: Response) {
  try {
    const mediaId = String(req.params.mediaId || '')
    const rawQuality = req.params.quality
    const quality = (Array.isArray(rawQuality) ? rawQuality[0] : rawQuality || 'original').toLowerCase()

    const doc = await Media.findById(mediaId).lean()
    if (!doc) {
      res.status(404).json({ error: 'Media not found' })
      return
    }

    /**
     * Variant resolution + S3 fetch resilience.
     *
     *   1. Build an ordered list of S3 keys to try:
     *      - Exact match (talep edilen tam genişlik)
     *      - Step-up: requested'tan büyük en küçük variant — quality
     *        kaybı yok, byte tasarrufu original'dan yine ciddi (örn 250
     *        istenip ladder [500, 1000, 2000] ise 500 → 4000px original
     *        yerine kullanıcı 500px alır)
     *      - Step-down: descending order — daha küçük variant'lar
     *      - Original asset (son fallback)
     *   2. Walk the list; first successful S3 GET wins.
     *      - `NoSuchKey` on a candidate is non-fatal — moves to the next.
     *      - Any other error short-circuits and bubbles up.
     *
     * Bu yaklaşım iki problemi birden çözer:
     *   - Talep edilen genişlik üretilmemişse istemci 4000px original'ı
     *     yüklemek zorunda kalmaz, en yakın variant döner.
     *   - DB'de variant kaydı varken S3 objesi (silinmiş, geri-getirilmemiş
     *     bucket vs.) düştüyse istek yine de servis edilebilsin.
     */
    const originalKey = `${doc.bucketId}/${doc.fileName}`
    const candidates: string[] = []
    // On-the-fly resize fallback (image kaynak + sayısal genişlik): pre-generated
    // variant S3 objesi yoksa (edrive-cdn migrasyonu) orijinali istenen genişliğe
    // küçültüp cache'leriz. Bu iki değişken loop SONRASINDA da kullanılır.
    let resizeWidth = 0
    let resizeCacheKey = ''

    if (quality !== 'original') {
      const requested = parseInt(quality, 10)
      if (Number.isNaN(requested) || requested <= 0) {
        res.status(400).json({ error: 'Invalid quality' })
        return
      }
      // Image thumbnails are matched on `width`; video variants on
      // `height`. Same step-up/step-down logic, just two pools to
      // walk. The Accept header filters which pool we draw from —
      // an `<img src=/f/<id>/250>` request comes in with
      // `Accept: image/avif,image/webp,...` and must NEVER fall
      // through to a video MP4 variant (browser would render a
      // broken-image glyph). Same the other way around: a
      // `<video src>` request with `Accept: video/*` shouldn't get
      // an image first-frame poster.
      const accept = (req.headers.accept || '').toLowerCase()
      const wantsImage = /image\//.test(accept) && !/video\//.test(accept)
      const wantsVideo = /video\//.test(accept) && !/image\//.test(accept)

      type Variant = {
        fileName: string
        size: number
        metric: number
        kind: 'image' | 'video'
      }
      const imageVariants: Variant[] = (doc.imageMeta?.thumbnails ?? []).map(
        (v) => ({
          fileName: v.fileName,
          size: v.size,
          metric: v.width,
          kind: 'image' as const,
        }),
      )
      const videoVariants: Variant[] = (doc.videoMeta?.variants ?? []).map(
        (v) => ({
          fileName: v.fileName,
          size: v.size,
          metric: v.height,
          kind: 'video' as const,
        }),
      )
      let pool: Variant[]
      if (wantsImage) pool = imageVariants
      else if (wantsVideo) pool = videoVariants
      else pool = [...imageVariants, ...videoVariants]
      const variantsAsc = pool.sort((a, b) => a.metric - b.metric)
      const seen = new Set<string>()
      const pushKey = (key: string) => {
        if (seen.has(key)) return
        seen.add(key)
        candidates.push(key)
      }
      // Variant `fileName` iki şemada olabilir:
      //   - YENİ (monorepo apps/cdn): tam S3 key (`${bucketId}/...` — generate
      //     fullKey ile çağrılıyor) → bare form doğrudan bulunur.
      //   - ESKİ (edrive-cdn migrasyonu): `doc.fileName` gibi bucket-relative
      //     saklanmış olabilir → bare form NoSuchKey verir; `${bucketId}/` ile
      //     prefix'lenince bulunur. (Bu yüzden eski media'lar variant yerine
      //     orijinali servis ediyordu.)
      // Her iki formu da dene — dedup `seen` ile.
      const pushOnce = (name: string | undefined) => {
        if (!name) return
        pushKey(name)
        if (!name.startsWith(`${doc.bucketId}/`)) {
          pushKey(`${doc.bucketId}/${name}`)
        }
      }

      // On-the-fly resize (image kaynak): daha önce üretilmiş resize cache'i
      // İLK aday olsun → varsa transcode'suz servis. Cache MISS + pre-gen
      // variant da yoksa loop SONRASINDA orijinal on-the-fly küçültülür.
      if (doc.type === 'image') {
        resizeWidth = requested
        const baseName = doc.fileName.replace(/\.[^./]+$/, '')
        resizeCacheKey = `${doc.bucketId}/_variants/${baseName}_w${requested}.webp`
        pushKey(resizeCacheKey)
      }

      // 1) Exact match
      const exact = variantsAsc.find((v) => v.metric === requested)
      pushOnce(exact?.fileName)

      // 2) Step-up: requested'tan büyük en küçük (en yakın larger) — kalite
      //    bozulmaz, byte yine original'dan çok küçük.
      const stepUp = variantsAsc.find((v) => v.metric > requested)
      pushOnce(stepUp?.fileName)

      // 3) Step-down: requested'tan küçükler descending order'da (en yakın
      //    küçük önce). Kalite kaybı kabul edilebilirse browser scale eder.
      for (let i = variantsAsc.length - 1; i >= 0; i--) {
        const v = variantsAsc[i]!
        if (v.metric < requested) pushOnce(v.fileName)
      }

      // Original is a fine fallback for the all-pool case but
      // CATEGORY-specific requests must NOT fall through to a
      // wrong-kind original (image request → video MP4 = broken
      // <img>). When the caller signalled a kind (Accept image/* OR
      // video/*) and we found no matching variant, return the early
      // 404 instead — the UI uses an `onError` fallback to display a
      // type icon.
      const wantsKind = wantsImage || wantsVideo
      const sourceMatchesKind =
        (wantsImage && doc.type === 'image') ||
        (wantsVideo && doc.type === 'video')
      // resizeWidth set ise (image + width) original'ı EKLEME — aday
      // bulunamazsa loop sonrası on-the-fly küçültme devreye girsin (510KB
      // original yerine ~istenen genişlik). Resize edemezsek orijinale düşeriz.
      if (!resizeWidth && (!wantsKind || sourceMatchesKind)) {
        candidates.push(originalKey)
      }
    } else {
      candidates.push(originalKey)
    }

    // STREAM (buffer'lama yok): ilk başarılı candidate'in S3 Body'sini pipe et.
    // GetObject eksik key'de NoSuchKey fırlatır (body inmeden) → fallback devam.
    // `Range` header'ı S3'e iletilir → video/audio için 206 partial + seek.
    const range = typeof req.headers.range === 'string' ? req.headers.range : undefined
    let s3: S3ObjectStream | null = null
    let servedKey: string | null = null
    let lastErr: unknown = null

    for (const key of candidates) {
      try {
        s3 = await getObjectStream(key, range)
        servedKey = key
        break
      } catch (err) {
        lastErr = err
        if (isMissingKeyError(err)) continue
        throw err
      }
    }

    // ON-THE-FLY RESIZE FALLBACK: image + width istendi, ne resize cache ne
    // pre-generated variant bulundu (edrive-cdn migrasyonundan variant objesi
    // eksik media). Orijinali istenen genişliğe küçült, cache'le, sun →
    // sonraki istekler (+ Cloudflare edge) statik servis. Transcode concurrency
    // sınırlı (withTransformLimit). Başarısız olursa orijinale düşeriz.
    if (!s3 && resizeWidth && resizeCacheKey) {
      try {
        const { body: source } = await getFromS3(originalKey)
        const result = await withTransformLimit(() => resizeImage(source, resizeWidth))
        uploadToS3(resizeCacheKey, result.buffer, result.mimeType, true).catch((e) =>
          console.warn('[file] resize cache write failed', resizeCacheKey, e?.message),
        )
        const dl = req.query.download === '1' || req.query.download === 'true'
        const fn = sanitizeFilename(
          (typeof req.query.filename === 'string' && req.query.filename) || doc.originalName,
        )
        res.status(200).set({
          'Content-Type': result.mimeType,
          'Content-Length': String(result.buffer.length),
          'Content-Disposition': `${dl ? 'attachment' : 'inline'}; filename="${fn}"`,
          'Cache-Control': 'public, max-age=31536000, immutable',
          'CDN-Cache-Control': 'public, max-age=31536000',
          ...publicFileCorsHeaders(req),
          'X-Sentroy-Variant': `${resizeWidth}~otf`,
        })
        res.send(result.buffer)
        return
      } catch (err) {
        // Resize başarısız → orijinali stream etmeyi dene (aşağıdaki 404 yerine).
        console.warn('[file] on-the-fly resize failed, falling back to original', mediaId, err)
        try {
          s3 = await getObjectStream(originalKey, range)
          servedKey = originalKey
        } catch {
          /* original da yoksa aşağıdaki 404'e düşer */
        }
      }
    }

    if (!s3) {
      // Tüm adaylar 'NoSuchKey' verirse buraya düşeriz; istemci için
      // gerçekten bulunamayan bir asset durumu.
      console.warn('[file] all variant candidates missing for', mediaId, lastErr)
      res.status(404).json({ error: 'File not found' })
      return
    }

    const contentType = s3.contentType
    const etagHeader = s3.etag ? `"${s3.etag}"` : null
    if (etagHeader && req.headers['if-none-match'] === etagHeader) {
      s3.body.destroy()
      res
        .status(304)
        .set({
          ETag: etagHeader,
          'Cache-Control': 'public, max-age=31536000, immutable',
          ...publicFileCorsHeaders(req),
        })
        .end()
      return
    }

    const download = req.query.download === '1' || req.query.download === 'true'
    const filename = sanitizeFilename(
      (typeof req.query.filename === 'string' && req.query.filename) || doc.originalName,
    )

    /**
     * Debug header: hangi adayın servis edildiğini ve mevcut variant
     * ladder'ını response'a iliştirir. DevTools Network tab'ında
     * `X-Sentroy-Variant` ve `X-Sentroy-Ladder` görülür → kullanıcı
     * istek+sonuç eşleşmediğinde nedeni hızlıca anlar (örn 500 istendi
     * ama ladder 500'ü içermiyor → original'a düştü).
     *
     * Production'da gizli alan yok — sadece S3 key isimleri (zaten
     * URL'de açık).
     */
    const variantLabel =
      servedKey === originalKey
        ? `original`
        : servedKey === resizeCacheKey
          ? `${resizeWidth}~otf` // önceden cache'lenmiş on-the-fly resize
          : (() => {
              const img = (doc.imageMeta?.thumbnails ?? []).find(
                (x) => x.fileName === servedKey,
              )
              if (img) return `${img.width}`
              const vid = (doc.videoMeta?.variants ?? []).find(
                (x) => x.fileName === servedKey,
              )
              if (vid) return `${vid.height}p`
              return 'unknown'
            })()
    const ladder = [
      ...(doc.imageMeta?.thumbnails ?? []).map((v) => v.width),
      ...(doc.videoMeta?.variants ?? []).map((v) => v.height),
    ]
      .sort((a, b) => a - b)
      .join(',')

    res.status(s3.partial ? 206 : 200).set({
      'Content-Type': contentType,
      ...(s3.contentLength != null ? { 'Content-Length': String(s3.contentLength) } : {}),
      ...(s3.contentRange ? { 'Content-Range': s3.contentRange } : {}),
      'Accept-Ranges': 'bytes',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'CDN-Cache-Control': 'public, max-age=31536000',
      ...publicFileCorsHeaders(req),
      'X-Sentroy-Variant': variantLabel,
      'X-Sentroy-Ladder': ladder || '(none)',
      ...(etagHeader && { ETag: etagHeader }),
    })
    s3.body.on('error', (err) => {
      console.error('[file] stream error', mediaId, err)
      if (!res.headersSent) res.status(500).json({ error: 'Stream failed' })
      else res.destroy()
    })
    s3.body.pipe(res)
  } catch (error: unknown) {
    if (isMissingKeyError(error)) {
      res.status(404).json({ error: 'File not found' })
      return
    }
    console.error('File fetch error:', error)
    res.status(500).json({ error: 'Failed to fetch file' })
  }
}

/**
 * On-the-fly format conversion. Source S3'ten okunur, transform edilir,
 * stream edilir. Result kalıcı yazılmaz — kullanıcı quota'sına etkisi yok.
 *
 *   GET /f/:mediaId/convert?format=jpg|png|webp|avif|png-page1|png-frame1
 *     - image source + format=jpg|png|webp|avif → sharp pipeline
 *     - pdf source + format=png-page1[&page=N]  → pdftoppm
 *     - video source + format=png-frame1        → ffmpeg first frame
 *
 * Ek query'ler:
 *   - q=<1-95>   image quality (default 85; png-* için yok sayılır)
 *   - page=<N>   pdf hangi sayfa (default 1)
 *   - download=1 Content-Disposition: attachment
 *   - filename=  custom (sanitize uygulanır)
 *
 * Cache: deterministik ETag (`convert:{id}:{format}:{q}:{page}`) → CDN edge
 * cache yine yardım eder, ama backend her seferinde transform yapar.
 */
async function handleConvert(req: Request, res: Response) {
  try {
    const mediaId = String(req.params.mediaId || '')
    const format = String(req.query.format || '').toLowerCase()
    if (!format) {
      res.status(400).json({ error: 'format query required' })
      return
    }

    const doc = await Media.findById(mediaId).lean()
    if (!doc) {
      res.status(404).json({ error: 'Media not found' })
      return
    }

    const sourceMime = (doc.mimeType || '').toLowerCase()
    const key = `${doc.bucketId}/${doc.fileName}`
    const quality = parseInt(String(req.query.q || '85'), 10) || 85
    const page = parseInt(String(req.query.page || '1'), 10) || 1

    // Desteklenen dönüşümü ÖNCE doğrula (source indirmeden 415 dönebilelim).
    const isImage = ['jpg', 'jpeg', 'png', 'webp', 'avif'].includes(format) && sourceMime.startsWith('image/')
    const isPdf = format === 'png-page1' && sourceMime === 'application/pdf'
    const isVideo = format === 'png-frame1' && sourceMime.startsWith('video/')
    if (!isImage && !isPdf && !isVideo) {
      res.status(415).json({ error: `Unsupported conversion: ${sourceMime} → ${format}` })
      return
    }
    const outExt = format === 'jpeg' ? 'jpg' : format.startsWith('png') ? 'png' : format
    const outMime =
      outExt === 'jpg' ? 'image/jpeg' : outExt === 'webp' ? 'image/webp' : outExt === 'avif' ? 'image/avif' : 'image/png'

    const etagHeader = `"convert:${mediaId}:${format}:${quality}:${page}"`
    if (req.headers['if-none-match'] === etagHeader) {
      res.status(304).set({ ETag: etagHeader, 'Cache-Control': 'public, max-age=31536000, immutable', ...publicFileCorsHeaders(req) }).end()
      return
    }

    const download = req.query.download === '1' || req.query.download === 'true'
    const rawName = typeof doc.originalName === 'string' ? doc.originalName : 'file'
    const baseName = rawName.replace(/\.[^.]+$/, '') || 'file'
    const filename = sanitizeFilename(
      (typeof req.query.filename === 'string' && req.query.filename) || `${baseName}.${outExt}`,
    )
    const headers = () => ({
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'CDN-Cache-Control': 'public, max-age=31536000',
      ...publicFileCorsHeaders(req),
      ETag: etagHeader,
    })

    // READ-THROUGH S3 CACHE: dönüştürülmüş variant deterministik key'de saklanır.
    // Cache HIT → stream (transcode YOK). MISS → source oku, transcode (concurrency
    // sınırlı), S3'e yaz, sun → sonraki istekler (+ Cloudflare edge) statik servis.
    const convertedKey = `${doc.bucketId}/_converted/${doc.fileName}.${format}.q${quality}.p${page}.${outExt}`
    try {
      const cached = await getObjectStream(convertedKey)
      res.status(200).set({
        'Content-Type': cached.contentType || outMime,
        ...(cached.contentLength != null ? { 'Content-Length': String(cached.contentLength) } : {}),
        ...headers(),
      })
      cached.body.on('error', () => { if (!res.headersSent) res.status(500).end(); else res.destroy() })
      cached.body.pipe(res)
      return
    } catch (err) {
      if (!isMissingKeyError(err)) throw err
      // cache miss → transcode below
    }

    const { body: source } = await getFromS3(key)
    const result = await withTransformLimit(async () => {
      if (isImage) return convertImage(source, format as ImageTargetFormat, quality)
      if (isPdf) return convertPdfToPng(source, page)
      return convertVideoToFirstFrame(source)
    })
    // Cache'e yaz (best-effort — yazma başarısız olsa da response'u ver).
    uploadToS3(convertedKey, result.buffer, result.mimeType, true).catch((e) =>
      console.warn('[convert] cache write failed', convertedKey, e?.message),
    )

    res.status(200).set({
      'Content-Type': result.mimeType,
      'Content-Length': String(result.buffer.length),
      ...headers(),
    })
    res.send(result.buffer)
  } catch (error: unknown) {
    const e = error as { name?: string; message?: string }
    if (e?.name === 'NoSuchKey' || e?.message === 'File not found') {
      res.status(404).json({ error: 'Source file not found' })
      return
    }
    console.error('Convert error:', error)
    res.status(502).json({
      error: e?.message || 'Conversion failed',
    })
  }
}

// Express 5 (path-to-regexp v8) artık `:quality?` optional syntax'ını
// desteklemiyor; aynı handler'ı iki ayrı route'a bağlıyoruz.
//
// `/convert` literal segment, `:quality` regex match etmeden önce
// kontrol edilir (Express route order); o yüzden order kritik —
// convert önce.
router.get('/:mediaId/convert', handleConvert)
router.get('/:mediaId', handleFile)
router.get('/:mediaId/:quality', handleFile)

export default router
