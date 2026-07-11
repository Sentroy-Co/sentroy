export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { bucketModel, mediaModel } from "@workspace/db/models"
import type { Media, MediaType } from "@workspace/db/types"
import { cdnUpload, cdnDelete } from "@workspace/cdn-client"
import { getDb } from "@workspace/db/client"
import { getStorageQuota, checkQuotaHeadroom } from "@/lib/quota"
import { formatUploadBytes } from "@/lib/upload-client"
import { toMediaFolder } from "@/lib/folders"

const DEFAULT_MAX_UPLOAD_BYTES = 52428800 // 50 MB fallback

/**
 * Admin'in `system_settings.maxUploadBytes` değerini in-memory cache ile
 * okur. Cache 60s — admin değişiklik 1 dakika içinde aktif olur, request
 * başına DB hit yok. Lambda-style cold start'ta cache reset (zaten DB'den
 * okunur, sürekli cold-restart sorun değil).
 */
let cachedLimit: { value: number; expiresAt: number } | null = null
async function getMaxUploadBytes(): Promise<number> {
  const now = Date.now()
  if (cachedLimit && cachedLimit.expiresAt > now) return cachedLimit.value
  const db = await getDb()
  const doc = await db
    .collection("system_settings")
    .findOne({ key: "global" })
  const value =
    typeof doc?.maxUploadBytes === "number"
      ? (doc.maxUploadBytes as number)
      : DEFAULT_MAX_UPLOAD_BYTES
  cachedLimit = { value, expiresAt: now + 60_000 }
  return value
}

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ slug: string; bucketSlug: string }>
  },
) {
  const { slug, bucketSlug } = await params
  const access = await resolveCompanyAccess(request, slug, "storage.view")
  if ("error" in access) return access.error

  const bucket = await bucketModel.findUserVisibleBySlug(access.companyId, bucketSlug)
  if (!bucket) return jsonError("Bucket not found", 404)

  const sp = request.nextUrl.searchParams
  const type = sp.get("type") as MediaType | null
  const folder = sp.get("folder")
  const q = sp.get("q") ?? undefined
  // Sort whitelisted — UI dışından gelen değerler için defansif.
  const SORT_KEYS = ["displayOrder", "name", "size", "createdAt", "type"] as const
  type SortKey = (typeof SORT_KEYS)[number]
  const sortRaw = sp.get("sort") ?? "displayOrder"
  const sort: SortKey = (SORT_KEYS as readonly string[]).includes(sortRaw)
    ? (sortRaw as SortKey)
    : "displayOrder"
  const dir = sp.get("dir") === "desc" ? "desc" : "asc"
  const limit = Math.min(Math.max(Number(sp.get("limit") || "60"), 1), 200)
  const skip = Math.max(Number(sp.get("skip") || "0"), 0)

  const filterOpts = {
    type: type ?? undefined,
    folder: folder ?? undefined,
    q,
  } as const

  const [items, total] = await Promise.all([
    mediaModel.findByBucket(bucket.id, {
      ...filterOpts,
      sort,
      dir,
      limit,
      skip,
    }),
    // countByBucketFilter aynı filter set'i — search/folder/type tutarlı
    // total veriyor, pagination doğru.
    mediaModel.countByBucketFilter(bucket.id, filterOpts),
  ])

  return jsonSuccess({ items, total, limit, skip, sort, dir })
}

/**
 * POST — multipart dosya yükleme proxy'si. Access kontrolü burada yapılır,
 * FormData stateless-cdn-server'a forward edilir. CDN server S3'e yazar
 * + media dokümanını oluşturur; biz dönüşte bucket usage'ı günceller ve
 * serialize edilmiş media'yı client'a döneriz.
 *
 * Bucket'ın kendi `isPublic` bayrağı default'u belirler; istemci payload'ta
 * override edebilir ama sadece bucket public'se — private bucket'ta public
 * dosya yazılamaz.
 */
export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ slug: string; bucketSlug: string }>
  },
) {
  const { slug, bucketSlug } = await params
  const access = await resolveCompanyAccess(request, slug, "media.upload")
  if ("error" in access) return access.error

  const bucket = await bucketModel.findUserVisibleBySlug(access.companyId, bucketSlug)
  if (!bucket) return jsonError("Bucket not found", 404)

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

  // Per-file size kontrolü — eskiden sadece CDN tarafı (multer) yakalıyordu
  // ve hatası generic 500 olarak UI'a düşüyordu. Burada early-fail edip
  // structured 413 dönüyoruz; UI bu mesajı kullanıcıya bire bir gösterebilir.
  // (Browser tarafı da `maxSize` prop'u ile zaten önceden filtreliyor; bu
  // ikinci hat hem doğrudan API çağrılarına karşı koruma, hem de CDN'in
  // limitiyle storage app limitinin senkron kalmasını sağlıyor.)
  const maxUploadBytes = await getMaxUploadBytes()
  if (file.size > maxUploadBytes) {
    return jsonError(
      `File too large (max ${formatUploadBytes(maxUploadBytes)})`,
      413,
    )
  }

  // Plan quota tüm dosya tiplerine uygulanır. Image'larda CDN server tarafı
  // sıkıştırma yapsa da kullanıcı planın byte limit'ine sadık kalmak istiyor:
  // pre-check incoming size üzerinden, gerçek tüketim post-upload
  // `media.size` (sıkıştırma sonrası) ile yazılır — her iki taraf da limit
  // içinde kalır.
  const quota = await getStorageQuota(access.companyId)
  const quotaError = checkQuotaHeadroom(quota, file.size)
  if (quotaError) return jsonError(quotaError, 413)

  const filename =
    (file as File).name ||
    (typeof form.get("filename") === "string"
      ? (form.get("filename") as string)
      : "upload.bin")

  const folder =
    typeof form.get("folder") === "string"
      ? toMediaFolder(form.get("folder") as string)
      : undefined
  const requestedPublic = form.get("public") === "true"
  const isPublic = bucket.isPublic && requestedPublic
  const alt =
    typeof form.get("alt") === "string" ? (form.get("alt") as string) : undefined
  const caption =
    typeof form.get("caption") === "string"
      ? (form.get("caption") as string)
      : undefined
  const tagsRaw = form.get("tags")
  const tags =
    typeof tagsRaw === "string"
      ? tagsRaw
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined
  // Video optimization knobs — both default off so the cheap
  // pass-through path stays the default. UI surfaces a single
  // switch that flips both on (compress + multi-quality ladder).
  const compressVideo = form.get("compressVideo") === "true"
  const transcodeVideo = form.get("transcodeVideo") === "true"

  try {
    const media = await cdnUpload(
      {
        companyId: access.companyId,
        bucketId: bucket.id,
        userId: access.callerUserId,
        userEmail: access.callerEmail,
      },
      file,
      {
        filename,
        folder,
        isPublic,
        alt,
        caption,
        tags,
        compressVideo,
        transcodeVideo,
      },
    )

    // Geçici diagnostic — db-debug list'i hala boş gösterirse cdn-server
    // response'unun shape'ini logla. Field adları farklıysa
    // (mediaId vs id, type vs fileType, vb.) burası anında belli olur.
    // Çözüldükten sonra kaldırılacak.
    console.log("[storage/upload] cdn response keys:", Object.keys(media), {
      mediaId: media.mediaId,
      bucketId: media.bucketId,
      type: media.type,
    })

    // CDN-server farklı bir DB'ye yazıyor (ya da hiç yazmıyor) — db-debug
    // endpoint'i `media` koleksiyonunu boş gösterdi, bucket counter'ları
    // ise dolu. Storage app'in DB'sinden okuduğumuz için upload sonrası
    // doc'u burada upsert edip kendi DB'mize yansıtıyoruz. Idempotent:
    // CDN-server ileride bizim DB'ye de yazmaya başlarsa duplicate olmaz.
    //
    // Önemli: bucketId/companyId/uploadedBy değerlerini CDN response'undan
    // değil bizim resolved verimizden alıyoruz. CDN-server farklı format
    // (slug, ObjectId, vb.) döndürebilir ve `findByBucket` o zaman boş
    // sonuç verir — gerçekleşen sorun buydu. Auth katmanı kim hangi
    // company'de olduğunu bilen tek otorite, oradan beslenelim.
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
      uploadedBy: access.callerUserId,
      tags: media.tags,
      alt: media.alt,
      caption: media.caption,
      isPublic: media.isPublic,
      // CDN-server thumbnail'ları `url` ile döndürür; bizim Media schema'sı
      // `fileName` ister. URL'in son segment'inden türetip iki alanı da
      // (forward-compat için url'i opaque saklayacak şekilde) yansıtıyoruz.
      imageMeta: media.imageMeta
        ? {
            ...media.imageMeta,
            thumbnails: media.imageMeta.thumbnails.map((t) => ({
              width: t.width,
              height: t.height,
              size: t.size,
              fileName:
                t.url.split("?")[0].split("/").pop() ?? "",
              // url'i de yedek olarak sakla; pickThumbnailUrl runtime'da
              // okuyup orijinal URL pattern'ından bağımsız çalışsın.
              url: t.url,
            })) as NonNullable<Media["imageMeta"]>["thumbnails"],
          }
        : undefined,
      // Sentroy Studio için CDN-server'ın upload sırasında ürettiği
      // audio analizi (duration + BPM). cdn response audioMeta yoksa
      // (image/video/document) doc'a yazma — schema default undefined.
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
      // upsertFromCdn fail ederse upload'ı reddetmek istemiyoruz —
      // dosya S3'e zaten yazıldı, bucket sayacı artırılacak. Yalnızca
      // log'la, list'te gözükmemesi sorununu db-debug ile teşhis ederiz.
      console.error(
        `[storage/upload] mediaModel.upsertFromCdn failed for bucket=${bucket.id} mediaId=${media.mediaId}:`,
        err instanceof Error ? err.message : err,
      )
    }

    await bucketModel.incrementUsage(bucket.id, {
      storageUsed: media.size,
      fileCount: 1,
    })

    return jsonSuccess(media, 201)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return jsonError(`Upload failed: ${msg}`, 502)
  }
}

/**
 * DELETE /media — bulk silme. Body: `{ ids: string[] }`. Tek round-trip
 * ile N media siler; CDN tarafına paralel pool ile (8 worker) S3 delete
 * paralelize edilir, network I/O latency dominant olduğu için tek-tek
 * sıralamadan radikal hızlanır.
 *
 * Cross-bucket id'ler bilinçli olarak göz ardı edilir (bucketModel
 * filter'ında düşer); usage counter sadece silinen kayıtların byte
 * toplamı kadar düşer.
 */
export async function DELETE(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ slug: string; bucketSlug: string }>
  },
) {
  const { slug, bucketSlug } = await params
  const access = await resolveCompanyAccess(request, slug, "media.delete")
  if ("error" in access) return access.error

  const bucket = await bucketModel.findUserVisibleBySlug(access.companyId, bucketSlug)
  if (!bucket) return jsonError("Bucket not found", 404)

  let body: { ids?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (
    !Array.isArray(body.ids) ||
    body.ids.length === 0 ||
    !body.ids.every((id): id is string => typeof id === "string" && id.length > 0)
  ) {
    return jsonError("ids (non-empty string[]) required")
  }

  // Bucket'a ait gerçek doc'ları çek — boyut + cross-bucket filter.
  const docs = await Promise.all(
    body.ids.map((id) => mediaModel.findById(id)),
  )
  const eligible = docs.filter(
    (m): m is NonNullable<typeof m> => m !== null && m.bucketId === bucket.id,
  )
  if (eligible.length === 0) {
    return jsonSuccess({ deleted: 0, failed: [], totalRequested: body.ids.length })
  }

  // Discriminated union narrowing function closure'a taşınmadığı için
  // local const'larla snapshot al — TypeScript bunları dar tip görür.
  const companyId = access.companyId
  const callerUserId = access.callerUserId
  const bucketId = bucket.id

  const POOL = 8
  let cursor = 0
  const failed: string[] = []
  const succeededIds: string[] = []
  let succeededSize = 0
  async function worker() {
    while (cursor < eligible.length) {
      const i = cursor++
      const m = eligible[i]
      if (!m) continue
      try {
        await cdnDelete(
          {
            companyId,
            bucketId,
            userId: callerUserId,
          },
          m.id,
        )
        succeededIds.push(m.id)
        succeededSize += m.size
      } catch (err) {
        console.warn(
          `[media bulk-delete] CDN delete failed for ${m.id}:`,
          err instanceof Error ? err.message : err,
        )
        failed.push(m.id)
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(POOL, eligible.length) }, worker),
  )

  // CDN delete başarılı kayıtlar zaten Media doc'unu siler (cdn-server
  // /cdn/file handler'ı). Defansif: DB'de hâlâ kalmış olabilecek
  // kayıtlar için yine bulk DB delete (idempotent).
  if (succeededIds.length > 0) {
    await mediaModel.deleteManyByIds(bucketId, succeededIds)
    await bucketModel.incrementUsage(bucketId, {
      storageUsed: -succeededSize,
      fileCount: -succeededIds.length,
    })
  }

  return jsonSuccess({
    deleted: succeededIds.length,
    failed,
    totalRequested: body.ids.length,
  })
}
