/**
 * stateless-cdn-server ile server-to-server konuşur. Her çağrı `x-cdn-secret`
 * + tenant scope header'larını (`x-company-id`, `x-bucket-id`, `x-user-id`)
 * otomatik ekler; route handler sadece FormData ve scope nesnesini geçirir.
 */

const CDN_URL = (process.env.CDN_API_URL || "http://localhost:4100").replace(/\/+$/, "")
const CDN_SECRET = process.env.CDN_API_SECRET

/**
 * CDN yapılandırılmış mı? Caller'lar (avatar upload, media route'ları) bunu
 * kontrol edip yapılandırılmamışsa temiz bir "storage not configured" durumu
 * (503) dönebilir — self-host'ta CDN_API_SECRET yoksa uncaught throw yerine.
 */
export function isCdnConfigured(): boolean {
  return !!CDN_SECRET
}

export interface CdnScope {
  companyId: string
  bucketId: string
  userId: string
  userEmail?: string
}

function scopeHeaders(scope: CdnScope): Record<string, string> {
  if (!CDN_SECRET) {
    // Defansif son çare — caller'lar isCdnConfigured() ile önden kontrol etmeli.
    throw new Error("CDN_API_SECRET is not configured")
  }
  const h: Record<string, string> = {
    "x-cdn-secret": CDN_SECRET,
    "x-company-id": scope.companyId,
    "x-bucket-id": scope.bucketId,
    "x-user-id": scope.userId,
  }
  if (scope.userEmail) h["x-user-email"] = scope.userEmail
  return h
}

export interface CdnUploadResult {
  mediaId: string
  bucketId: string
  companyId: string
  url: string
  downloadUrl: string
  fileName: string
  originalName: string
  folder: string
  type: "image" | "video" | "audio" | "document" | "other"
  mimeType: string
  size: number
  uploadedBy: string
  isPublic: boolean
  alt?: string
  caption?: string
  tags: string[]
  imageMeta?: {
    width: number
    height: number
    orientation: "landscape" | "portrait" | "square"
    thumbnails: Array<{
      width: number
      height: number
      size: number
      url: string
    }>
  }
  /** Populated only for video uploads where the caller asked for
   *  multi-quality transcoding (`transcodeVideo: true`). The raw
   *  upload pass-through never produces this field. */
  videoMeta?: {
    width: number
    height: number
    /** Length in seconds. */
    duration: number
    variants: Array<{
      /** 144 / 480 / 720 / 1080 — the same number that goes in the
       *  `/f/:mediaId/:quality` URL when requesting this variant. */
      height: number
      width: number
      size: number
      bitrate?: number
      url: string
    }>
  }
  /** Populated for `audio/*` uploads — duration + BPM written
   *  synchronously at upload time so Sentroy Studio can render
   *  decks/library without per-track in-browser analysis. `bpm` is
   *  octave-folded into [70, 180]; null when the onset signal was
   *  too sparse for a reliable peak. */
  audioMeta?: {
    duration: number
    bpm: number | null
    sampleRate: number
    channels: number
  }
  /** Async background-processing tracker. Present on video uploads
   *  that opted into the multi-quality ladder. UI polls the media
   *  list while `status` is `queued` or `processing`. */
  processing?: {
    status: "queued" | "processing" | "completed" | "failed"
    variantsTotal?: number
    variantsCompleted?: number
    error?: string
    startedAt?: string
    completedAt?: string
  }
  createdAt: string
  updatedAt: string
}

export async function cdnUpload(
  scope: CdnScope,
  file: Blob,
  opts: {
    filename: string
    folder?: string
    isPublic?: boolean
    alt?: string
    caption?: string
    tags?: string[]
    /**
     * Light single-pass H.264 re-encode at the source resolution.
     * Trims typical phone/screen-record uploads by 30-60% with no
     * visible quality hit. Default off — opting in roughly doubles
     * the upload-handler latency. Ignored for non-video uploads.
     */
    compressVideo?: boolean
    /**
     * Multi-quality variant ladder (144p / 480p / 720p / 1080p).
     * Implies `compressVideo`. Variants land alongside the original
     * in S3 and become available via `/f/:mediaId/:height` (e.g.
     * `/720`). Generation is sequential ffmpeg passes, so latency
     * scales with both source resolution AND duration — expect
     * tens of seconds for short clips, minutes for longer ones.
     * Default off; UI should expose a switch and warn the user.
     * Ignored for non-video uploads.
     */
    transcodeVideo?: boolean
  },
): Promise<CdnUploadResult> {
  const form = new FormData()
  form.append("file", file, opts.filename)
  form.append("folderType", opts.folder || "uploads")
  form.append("public", opts.isPublic ? "true" : "false")
  if (opts.alt) form.append("alt", opts.alt)
  if (opts.caption) form.append("caption", opts.caption)
  if (opts.tags?.length) form.append("tags", opts.tags.join(","))
  if (opts.compressVideo) form.append("compressVideo", "true")
  if (opts.transcodeVideo) form.append("transcodeVideo", "true")

  const res = await fetch(`${CDN_URL}/cdn/upload`, {
    method: "POST",
    headers: scopeHeaders(scope),
    body: form,
  })

  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean
    media?: CdnUploadResult
    error?: string
    details?: string
  }

  if (!res.ok || !json.success || !json.media) {
    throw new Error(json.error || json.details || `CDN upload failed (${res.status})`)
  }

  return json.media
}

/**
 * Mevcut bir media'nın içeriğini in-place overwrite eder (kod/metin editörü
 * kaydet). Key/fileName ve public `/f/:id` URL'i sabit kalır. Yalnız
 * metin-tabanlı dosyalar için önerilir (binary için `cdnUpload` + pipeline).
 */
export async function cdnReplaceContent(
  scope: CdnScope,
  mediaId: string,
  content: string,
  mimeType: string,
): Promise<CdnUploadResult> {
  const form = new FormData()
  const blob = new Blob([content], { type: mimeType })
  form.append("file", blob, "content")

  const res = await fetch(`${CDN_URL}/cdn/replace/${encodeURIComponent(mediaId)}`, {
    method: "POST",
    headers: scopeHeaders(scope),
    body: form,
  })

  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean
    media?: CdnUploadResult
    error?: string
  }

  if (!res.ok || !json.success || !json.media) {
    throw new Error(json.error || `CDN replace failed (${res.status})`)
  }

  return json.media
}

export async function cdnDelete(
  scope: CdnScope,
  mediaId: string,
): Promise<void> {
  const res = await fetch(`${CDN_URL}/cdn/file`, {
    method: "DELETE",
    headers: {
      ...scopeHeaders(scope),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mediaId }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`CDN delete failed (${res.status}): ${body}`)
  }
}

export interface CdnBucketPurgeResult {
  success: boolean
  s3Deleted: number
  s3Failed: string[]
  docsDeleted: number
  /** S3 silme kısmen başarısız olursa DB'de tutulan doc sayısı. */
  docsRemaining: number
}

/**
 * Bucket'ın içindeki tüm dosyaları S3'ten ve Media koleksiyonundan tek
 * çağrıda temizler. Çağıran (storage app) ardından kendi `buckets`
 * dokümanını da siler.
 */
export async function cdnPurgeBucket(scope: CdnScope): Promise<CdnBucketPurgeResult> {
  const res = await fetch(`${CDN_URL}/cdn/bucket`, {
    method: "DELETE",
    headers: scopeHeaders(scope),
  })

  const json = (await res.json().catch(() => ({}))) as Partial<CdnBucketPurgeResult> & { error?: string }
  if (!res.ok) {
    throw new Error(json.error || `CDN purge failed (${res.status})`)
  }
  return {
    success: Boolean(json.success),
    s3Deleted: json.s3Deleted ?? 0,
    s3Failed: json.s3Failed ?? [],
    docsDeleted: json.docsDeleted ?? 0,
    docsRemaining: json.docsRemaining ?? 0,
  }
}

export interface CdnVisibilityResult {
  success: boolean
  s3Updated: number
  s3Failed: string[]
  docsUpdated: number
}

/**
 * Bucket'ın tüm mevcut dosyalarının ACL'ini public-read ↔ private arasında
 * toplu değiştirir; Media dokümanlarındaki `isPublic` alanını da günceller.
 * Yeni yüklenen dosyaları ayrıca `bucket.isPublic` belirler (upload proxy).
 */
export async function cdnSetBucketVisibility(
  scope: CdnScope,
  isPublic: boolean,
): Promise<CdnVisibilityResult> {
  const res = await fetch(`${CDN_URL}/cdn/bucket/visibility`, {
    method: "PATCH",
    headers: {
      ...scopeHeaders(scope),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ isPublic }),
  })

  const json = (await res.json().catch(() => ({}))) as Partial<CdnVisibilityResult> & {
    error?: string
    details?: string
  }
  if (!res.ok) {
    // CDN-server top-level catch'inde 500 + `{ error, details }` döner;
    // `details` gerçek S3/SDK hata mesajını içerir (ACL desteği yok,
    // permission missing vb). UI'da kullanıcı kök sebebi görsün.
    const baseMsg = json.error || `CDN visibility change failed (${res.status})`
    const fullMsg = json.details ? `${baseMsg}: ${json.details}` : baseMsg
    throw new Error(fullMsg)
  }
  return {
    success: Boolean(json.success),
    s3Updated: json.s3Updated ?? 0,
    s3Failed: json.s3Failed ?? [],
    docsUpdated: json.docsUpdated ?? 0,
  }
}

/**
 * Private bucket içindeki bir dosyayı proxy'leyerek stream eder. cdn-server
 * public URL'ler için doğrudan yanıt veriyor; private için storage app bu
 * fonksiyonu kullanır, kendi auth gate'inden geçirdikten sonra byte'ları
 * client'a iletir.
 */
export async function cdnFetchFile(
  mediaId: string,
  quality: "original" | number = "original",
  opts?: {
    download?: boolean
    filename?: string
    /** Tarayıcının `Range` header'ı — audio/video seek + duration için CDN'e
     *  iletilir; CDN 206 + Content-Range döner (getObjectStream S3 Range). */
    range?: string
  },
): Promise<Response> {
  const q = quality === "original" ? "original" : String(quality)
  const url = new URL(`${CDN_URL}/f/${mediaId}/${q}`)
  if (opts?.download) url.searchParams.set("download", "1")
  if (opts?.filename && opts.filename.trim()) {
    url.searchParams.set("filename", opts.filename.trim())
  }
  const headers: Record<string, string> = {}
  if (opts?.range) headers["Range"] = opts.range
  return fetch(url.toString(), { headers })
}

/**
 * On-the-fly format conversion. CDN `/f/:id/convert?format=...` endpoint'ini
 * çağırır; sonuç stream döner. Auth proxy `cdnFetchFile` ile aynı pattern,
 * fakat path `/convert` literal segment.
 *
 * Format key'leri (CDN contract):
 *   - image: `jpg | png | webp | avif`
 *   - pdf:   `png-page1` (page query opsiyonel)
 *   - video: `png-frame1` (first frame extract)
 */
export interface CdnConvertOptions {
  /** image quality 1-95 (default 85). png-* için yok sayılır. */
  q?: number
  /** PDF için sayfa numarası (1-indexed). */
  page?: number
  /** Content-Disposition: attachment ile dön. */
  download?: boolean
  /** Custom dosya adı (sanitize CDN tarafında uygulanır). */
  filename?: string
}

export async function cdnFetchConverted(
  mediaId: string,
  format: string,
  opts: CdnConvertOptions = {},
): Promise<Response> {
  const params = new URLSearchParams({ format })
  if (opts.q) params.set("q", String(opts.q))
  if (opts.page) params.set("page", String(opts.page))
  if (opts.download) params.set("download", "1")
  if (opts.filename) params.set("filename", opts.filename)
  return fetch(`${CDN_URL}/f/${mediaId}/convert?${params.toString()}`)
}
