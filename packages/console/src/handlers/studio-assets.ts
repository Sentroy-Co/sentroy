import { NextRequest } from "next/server"
import { cdnUpload, cdnDelete } from "@workspace/cdn-client"
import {
  bucketModel,
  mediaModel,
  studioAudioAnalysisModel,
} from "@workspace/db/models"
import * as accessTokenModel from "@workspace/db/models/access-token"
import type { Bucket } from "@workspace/db/types"
import { STUDIO_BUCKET_SLUG } from "@workspace/db/constants"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import { audit } from "@workspace/console/lib/audit"

/**
 * Sentroy Studio — asset (audio sample) upload + list + delete.
 *
 * Bucket lazy-provision: `__studio` slug ile per-company auto-managed
 * private bucket. Storage UI'da görünmez (`__` prefix), sadece Studio
 * editor'den tüketilir.
 *
 * Upload flow:
 *   1. Validate multipart `file` field (audio/* only)
 *   2. cdnUpload(scope, blob) → S3 + media doc
 *   3. mediaModel.upsertFromCdn → DB'ye yansıt
 *   4. bucketModel.incrementUsage
 *   5. Return { mediaId, url, mimeType, size, duration? }
 *
 * Permission: `studio.manage`.
 *
 * v1'de quota check yok — kullanıcının storage plan limit'i tek limit.
 * Storage app'in plan check'i CDN upload'da zaten devrede (cdn-server
 * tarafı bucket storage stats'a göre reject eder).
 */

const ACCEPT_MIME = new Set([
  "audio/mpeg",      // .mp3
  "audio/mp4",       // .m4a
  "audio/aac",       // .aac
  "audio/wav",       // .wav
  "audio/x-wav",     // .wav alt
  "audio/wave",      // .wav alt
  "audio/flac",      // .flac
  "audio/x-flac",    // .flac alt
  "audio/ogg",       // .ogg
  "audio/webm",      // browser MediaRecorder default
  "audio/aiff",      // .aiff
  "audio/x-aiff",    // .aiff alt
])

const MAX_FILE_BYTES = 100 * 1024 * 1024 // 100 MB per file

async function getOrCreateStudioBucket(companyId: string): Promise<Bucket> {
  const existing = await bucketModel.findBySlug(companyId, STUDIO_BUCKET_SLUG)
  if (existing) return existing
  return bucketModel.create({
    companyId,
    name: "Studio",
    slug: STUDIO_BUCKET_SLUG,
    description: "Audio samples, recordings and project assets — Sentroy Studio'nun otomatik provisioned'ı, ama kullanıcı kendisi de yönetebilir.",
    isPublic: false,
    storageUsed: 0,
    fileCount: 0,
  })
}

// ─── SDK access token (short-lived, for browser MediaManager) ───────────

/**
 * Studio editor mount'unda çağırılır. Mevcut session user'ın bu company
 * için 1 saatlik SDK access token'ı üretir (plaintext sadece bu response'ta).
 * Studio editor MediaManager'a token'ı pass eder; MediaManager
 * `https://storage.sentroy.com/api/...` çağrılarında `Authorization: Bearer
 * stk_...` ile gider.
 *
 * Token cookie'leri yerine bunu kullanma sebebi: storage.sentroy.com
 * Studio'nun `studio.sentroy.com` origin'inden gelen cross-origin XHR'lara
 * CORS izni vermez; SDK Bearer token akışı kullanırsa storage'ın same-origin
 * gibi davranan API'sine direkt çıkar (CORS hâlâ gerekir ama Bearer auth
 * Sentroy mevcut Sentroy SDK kullanıcılarının üretim akışı).
 */
export async function sdkTokenPost(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug, "studio.manage")
  if ("error" in access) return access.error

  // Bucket'ı da peşinen oluştur — MediaManager bucketSlug="studio" ile gelecek.
  await getOrCreateStudioBucket(access.companyId)

  const { plainToken, token } = await accessTokenModel.create({
    companyId: access.companyId,
    name: `studio-sdk-${access.session!.user.id.slice(0, 6)}-${Date.now()}`,
    createdById: access.session!.user.id,
    // 2-saat TTL — editor session'ı için yeterli, çok uzun stk_ token bırakıp
    // güvenlik yüzeyi büyütmemek için kısa.
    expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
  })

  return jsonSuccess({
    accessToken: plainToken,
    tokenPrefix: token.tokenPrefix,
    expiresAt: token.expiresAt,
  })
}

// ─── POST upload ─────────────────────────────────────────────────────────

export async function uploadPost(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug, "studio.manage")
  if ("error" in access) return access.error

  const bucket = await getOrCreateStudioBucket(access.companyId)

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return jsonError("Expected multipart/form-data body")
  }

  const file = form.get("file")
  if (!(file instanceof Blob) || file.size === 0) {
    return jsonError("No file provided")
  }
  if (file.size > MAX_FILE_BYTES) {
    return jsonError(`File too large (max ${MAX_FILE_BYTES / (1024 * 1024)} MB)`, 413)
  }
  const mime = file.type || "application/octet-stream"
  // MediaRecorder bazen "audio/webm;codecs=opus" gibi parametreli mime
  // gönderir; ; öncesi base mime ile karşılaştır + audio/* fallback.
  const baseMime = mime.split(";")[0].trim().toLowerCase()
  if (!ACCEPT_MIME.has(baseMime) && !baseMime.startsWith("audio/")) {
    return jsonError(
      `Unsupported audio type: ${mime}. Allowed: MP3, M4A, AAC, WAV, FLAC, OGG, AIFF, WebM.`,
      415,
    )
  }

  const filename =
    (file as File).name ||
    (typeof form.get("filename") === "string"
      ? (form.get("filename") as string)
      : "sample.bin")
  // Yüklenecek klasör — kullanıcının seçtiği folder korunur (önceden yalnız
  // "recordings"/"samples" hardcode'luydu; kullanıcı klasörü yok sayılıp
  // "samples"a düşüyordu). Normalize: trim + slash temizliği + max 120,
  // boşsa "samples" default (PATCH move ile aynı kural).
  const folderRaw = form.get("folder")
  const folder =
    typeof folderRaw === "string" && folderRaw.trim().length > 0
      ? folderRaw
          .trim()
          .replace(/^\/+|\/+$/g, "")
          .replace(/\/+/g, "/")
          .slice(0, 120) || "samples"
      : "samples"

  try {
    const media = await cdnUpload(
      {
        companyId: access.companyId,
        bucketId: bucket.id,
        userId: access.session!.user.id,
        userEmail: access.session!.user.email,
      },
      file,
      {
        filename,
        folder,
        isPublic: false, // Studio assets daima private, signed URL ile serve
        tags: ["studio", folder],
      },
    )

    try {
      await mediaModel.upsertFromCdn(media.mediaId, {
        bucketId: bucket.id,
        companyId: access.companyId,
        fileName: media.fileName,
        originalName: media.originalName,
        type: media.type,
        size: media.size,
        mimeType: media.mimeType,
        folder: media.folder,
        uploadedBy: access.session!.user.id,
        tags: media.tags,
        alt: media.alt,
        caption: media.caption,
        isPublic: media.isPublic,
        imageMeta: undefined,
        // CDN-server'ın upload sırasında ürettiği BPM + duration analizi
        // (ffmpeg decode + autocorrelation). Studio editor browser'da
        // tekrar analiz etmez — server'ın değerini kullanır.
        audioMeta: media.audioMeta
          ? {
              duration: media.audioMeta.duration,
              bpm: media.audioMeta.bpm,
              sampleRate: media.audioMeta.sampleRate,
              channels: media.audioMeta.channels,
            }
          : undefined,
        createdAt: media.createdAt,
        updatedAt: media.updatedAt,
      })
    } catch (err) {
      console.error(
        `[studio/upload] upsertFromCdn failed mediaId=${media.mediaId}:`,
        err instanceof Error ? err.message : err,
      )
    }

    // Server-side analizi studio'nun analysis cache koleksiyonuna da
    // seed et: listGet ileride bu cache'i okuduğunda BPM zaten orada
    // olur (in-browser essentia.js pass'i atlanır). Sentroy Studio
    // editor için "açar açmaz hazır BPM" deneyimi.
    if (media.audioMeta) {
      try {
        await studioAudioAnalysisModel.upsert({
          mediaId: media.mediaId,
          fileHash: null,
          bpm: media.audioMeta.bpm,
          beats: [],
          key: null,
          scale: null,
          duration: media.audioMeta.duration,
          peaks: null,
          sampleRate: media.audioMeta.sampleRate,
          channels: media.audioMeta.channels,
          engine: "server-ffmpeg-autocorr",
        })
      } catch (err) {
        console.error(
          `[studio/upload] analysis seed failed mediaId=${media.mediaId}:`,
          err instanceof Error ? err.message : err,
        )
      }
    }

    await bucketModel.incrementUsage(bucket.id, {
      storageUsed: media.size,
      fileCount: 1,
    })

    await audit({
      userId: access.session!.user.id,
      companyId: access.companyId,
      action: "studio.asset.upload",
      resource: "studio-asset",
      resourceId: media.mediaId,
      details: { filename, size: media.size, mimeType: media.mimeType, folder },
    })

    return jsonSuccess(
      {
        mediaId: media.mediaId,
        url: media.url,
        fileName: media.fileName,
        originalName: media.originalName,
        mimeType: media.mimeType,
        size: media.size,
        folder: media.folder,
        createdAt: media.createdAt,
      },
      201,
    )
  } catch (err) {
    console.error("[studio/upload] cdnUpload failed:", err)
    return jsonError(
      err instanceof Error ? err.message : "Upload failed",
      500,
    )
  }
}

// ─── GET list ────────────────────────────────────────────────────────────

export async function listGet(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug, "studio.manage")
  if ("error" in access) return access.error

  const bucket = await bucketModel.findBySlug(access.companyId, STUDIO_BUCKET_SLUG)
  if (!bucket) return jsonSuccess([])

  const url = new URL(request.url)
  const folder = url.searchParams.get("folder") ?? undefined
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "200"), 500)

  const items = await mediaModel.findByBucket(bucket.id, {
    folder,
    limit,
    sort: "createdAt",
    dir: "desc",
  })

  // Cached BPM analysis attach (batched). v1 — N+1 OK on small lists.
  const out = await Promise.all(
    items.map(async (m) => {
      const analysis = await studioAudioAnalysisModel.findByMedia(m.id)
      return {
        mediaId: m.id,
        fileName: m.fileName,
        originalName: m.originalName,
        mimeType: m.mimeType,
        size: m.size,
        folder: m.folder,
        createdAt: m.createdAt,
        bpm: analysis?.bpm ?? null,
        key: analysis?.key ?? null,
        duration: analysis?.duration ?? null,
      }
    }),
  )

  return jsonSuccess(out)
}

// ─── PATCH (folder move + rename) ───────────────────────────────────────

/**
 * Studio asset patch — şu an folder + originalName güncellemesi destekler.
 * Folder field arbitrary string (DB level constraint yok); kullanıcı yeni
 * folder ismi yazınca implicit oluşur. Boş string → "samples" default'a
 * çevrilir (library always-on-top behavior için).
 */
export async function itemPatch(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; mediaId: string }> },
) {
  const { slug, mediaId } = await params
  const access = await assertCompanyAccess(request, slug, "studio.manage")
  if ("error" in access) return access.error

  const media = await mediaModel.findById(mediaId)
  if (!media || media.companyId !== access.companyId) {
    return jsonError("Asset not found", 404)
  }

  let body: { folder?: string; originalName?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const patch: Partial<typeof media> = {}
  if (typeof body.folder === "string") {
    // Normalize: trim, collapse multiple slashes, fallback to "samples"
    const f = body.folder.trim().replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/")
    patch.folder = f.length > 0 ? f : "samples"
    if (patch.folder.length > 120) {
      return jsonError("Folder path too long (max 120 chars)")
    }
  }
  if (typeof body.originalName === "string") {
    const n = body.originalName.trim()
    if (!n || n.length > 200) {
      return jsonError("Invalid name (1-200 chars)")
    }
    patch.originalName = n
  }
  if (Object.keys(patch).length === 0) {
    return jsonError("No fields to update")
  }

  const updated = await mediaModel.updateById(mediaId, patch)
  if (!updated) return jsonError("Update failed", 500)

  await audit({
    userId: access.session!.user.id,
    companyId: access.companyId,
    action: "studio.asset.patch",
    resource: "studio-asset",
    resourceId: mediaId,
    details: patch,
  })

  return jsonSuccess({
    mediaId: updated.id,
    folder: updated.folder,
    originalName: updated.originalName,
  })
}

// ─── DELETE ──────────────────────────────────────────────────────────────

export async function itemDelete(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; mediaId: string }> },
) {
  const { slug, mediaId } = await params
  const access = await assertCompanyAccess(request, slug, "studio.manage")
  if ("error" in access) return access.error

  const media = await mediaModel.findById(mediaId)
  if (!media || media.companyId !== access.companyId) {
    return jsonError("Asset not found", 404)
  }

  // S3 + CDN-server doc cleanup
  try {
    await cdnDelete(
      {
        companyId: access.companyId,
        bucketId: media.bucketId,
        userId: access.session!.user.id,
        userEmail: access.session!.user.email,
      },
      mediaId,
    )
  } catch (err) {
    console.error("[studio/delete] cdnDelete failed:", err)
  }

  await mediaModel.deleteById(mediaId)
  await studioAudioAnalysisModel.removeByMedia(mediaId)
  await bucketModel.incrementUsage(media.bucketId, {
    storageUsed: -media.size,
    fileCount: -1,
  })

  await audit({
    userId: access.session!.user.id,
    companyId: access.companyId,
    action: "studio.asset.delete",
    resource: "studio-asset",
    resourceId: mediaId,
    details: { fileName: media.fileName, size: media.size },
  })

  return jsonSuccess({ ok: true })
}

// ─── BPM analysis cache (browser essentia.js posts back result) ──────────

export async function analysisPut(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; mediaId: string }> },
) {
  const { slug, mediaId } = await params
  const access = await assertCompanyAccess(request, slug, "studio.manage")
  if ("error" in access) return access.error

  const media = await mediaModel.findById(mediaId)
  if (!media || media.companyId !== access.companyId) {
    return jsonError("Asset not found", 404)
  }

  let body: {
    bpm?: number | null
    beats?: number[]
    key?: string | null
    scale?: "major" | "minor" | "unknown" | null
    duration?: number
    peaks?: string | null
    sampleRate?: number
    channels?: number
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON")
  }

  const analysis = await studioAudioAnalysisModel.upsert({
    mediaId,
    fileHash: null,
    bpm: body.bpm ?? null,
    beats: body.beats ?? [],
    key: body.key ?? null,
    scale: body.scale ?? null,
    duration: body.duration ?? 0,
    peaks: body.peaks ?? null,
    sampleRate: body.sampleRate ?? 44100,
    channels: body.channels ?? 2,
    engine: "essentia-js",
  })

  return jsonSuccess(analysis)
}
