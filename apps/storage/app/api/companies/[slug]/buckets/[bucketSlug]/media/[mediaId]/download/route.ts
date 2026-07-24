export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { jsonError } from "@workspace/console/lib/api-helpers"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { bucketModel, companyModel, mediaModel } from "@workspace/db/models"
import { cdnFetchFile, cdnFetchConverted } from "@workspace/cdn-client"
import { canViewItem } from "@/lib/storage-access"

/**
 * Auth'lu indirme/görüntüleme proxy'si. Public bucket/medya için istemci
 * doğrudan cdn-server'ın public URL'ini kullanabilir; bu endpoint private
 * medya için company/member yetkisini doğruladıktan sonra byte'ları
 * cdn-server'dan stream eder.
 *
 * Query params:
 *   - quality=500          → thumbnail varyantı (mevcut)
 *   - format=jpg|png|...   → on-the-fly convert (CDN /convert endpoint)
 *   - q=85                 → convert quality (1-95)
 *   - page=N               → PDF convert için sayfa
 *   - download=1           → Content-Disposition: attachment
 *   - filename=x.jpg       → custom dosya adı
 */
export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ slug: string; bucketSlug: string; mediaId: string }>
  },
) {
  const { slug, bucketSlug, mediaId } = await params

  /**
   * İki yollu auth: bucket+media public ise hızlı yol — companyModel ile
   * slug → id resolve, bucket lookup, media lookup. Erişim açıksa session
   * kontrolüne girilmez (gömülü <img>'ler ve dış paylaşım için kritik).
   * Aksi halde resolveCompanyAccess `storage.view` permission gate'inden
   * geçer. System-managed bucket'lar (avatar, vb) findUserVisibleBySlug
   * tarafından elenir; bunlar kendi özel public route'ları üzerinden
   * servis edilir.
   */
  const company = await companyModel.findBySlug(slug)
  if (!company) return jsonError("Not found", 404)

  // viewer=null: sistem bağlamında (public hızlı yol için) yalnız
  // system-managed elenir; bucket erişim gate'i authed dalda uygulanır.
  const bucket = await bucketModel.findUserVisibleBySlug(company.id, bucketSlug, null)
  if (!bucket) return jsonError("Bucket not found", 404)

  const media = await mediaModel.findById(mediaId)
  if (!media || media.bucketId !== bucket.id)
    return jsonError("Media not found", 404)

  const isPublicAccess = bucket.isPublic && media.isPublic
  if (!isPublicAccess) {
    const access = await resolveCompanyAccess(request, slug, "storage.view")
    if ("error" in access) return access.error
    // Şirket-içi erişim tier'ı: hem bucket hem dosya "owner"/"admins" ise
    // yetkisiz üyeye servis edilmez. (isPublic dosyalar orthogonal — yukarıdaki
    // hızlı yol paylaşım linkini tier'dan bağımsız açık tutar.)
    if (
      !canViewItem(bucket.access, bucket.ownerUserId, access) ||
      !canViewItem(media.access, media.uploadedBy, access, media.sharedWith)
    ) {
      return jsonError("Media not found", 404)
    }
  }

  const sp = request.nextUrl.searchParams
  const format = sp.get("format")?.trim().toLowerCase()

  const wantDownload =
    sp.get("download") === "1" || sp.get("download") === "true"
  const filenameRaw = sp.get("filename")
  const clientFilename =
    typeof filenameRaw === "string" && filenameRaw.trim().length > 0
      ? filenameRaw.trim()
      : undefined

  let upstream: Response
  try {
    if (format) {
      // Convert path — CDN `/f/:id/convert?format=...`
      const q = parseInt(sp.get("q") || "", 10) || undefined
      const page = parseInt(sp.get("page") || "", 10) || undefined
      const download =
        sp.get("download") === "1" || sp.get("download") === "true"
      const filename = sp.get("filename") || undefined
      upstream = await cdnFetchConverted(media.id, format, {
        q,
        page,
        download,
        filename,
      })
    } else {
      const qualityRaw = sp.get("quality")
      let quality: "original" | number = "original"
      if (qualityRaw && qualityRaw !== "original") {
        const n = parseInt(qualityRaw, 10)
        if (!Number.isNaN(n) && n > 0) quality = n
      }
      upstream = await cdnFetchFile(media.id, quality, {
        download: wantDownload,
        filename: clientFilename,
        // Range'i CDN'e ilet → audio/video oynatıcı seek + duration (206).
        // Bunsuz iOS AVPlayer (video_player/just_audio) progressive medyayı
        // OYNATMAZ; public `/f` route'u zaten iletiyordu, private burası eksikti.
        range: request.headers.get("range") ?? undefined,
      })
    }
  } catch (err) {
    console.error("[storage/download] CDN fetch error:", err)
    return jsonError(
      err instanceof Error ? err.message : "CDN request failed",
      502,
    )
  }

  if (!upstream.ok || !upstream.body) {
    return jsonError(`CDN fetch failed (${upstream.status})`, 502)
  }

  const headers = new Headers()
  const passthrough = [
    "content-type",
    "content-length",
    "content-disposition",
    "etag",
    "last-modified",
    // Range/seek — audio/video oynatıcı 206 + bu header'larla duration+seek yapar.
    "content-range",
    "accept-ranges",
  ]
  for (const h of passthrough) {
    const v = upstream.headers.get(h)
    if (!v) continue
    try {
      headers.set(h, v)
    } catch {
      /* Geçersiz header değeri (ör. bazı Content-Disposition varyantları) — atla */
    }
  }
  // Cache-Control matrisi:
  //  - Public erişim: edge / CDN cacheleyebilsin → `public`
  //  - Private (auth gate'inden geçti): yalnızca tarayıcı cache → `private`
  //  - Variant (quality/format query): mediaId+param deterministik byte'lar,
  //    `immutable` + 1 gün; original için kısa tutalım (silme/replace ihtimali).
  const isVariant = sp.has("quality") || Boolean(format)
  const scope = isPublicAccess ? "public" : "private"
  if (isVariant) {
    headers.set("Cache-Control", `${scope}, max-age=86400, immutable`)
  } else {
    headers.set("Cache-Control", `${scope}, max-age=${isPublicAccess ? 300 : 60}`)
  }

  // CORS: public path'te wildcard, herhangi bir origin'den <img> / fetch
  // çalışsın. Private erişimde de echo Origin (proxy.ts /api branch'i
  // zaten cookie auth için doğru header'ları yazar; burada redundant
  // olması zarar vermez ama set etmiyoruz — proxy yetkili).
  if (isPublicAccess) {
    headers.set("Access-Control-Allow-Origin", "*")
    headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
    headers.set("Cross-Origin-Resource-Policy", "cross-origin")
  }

  try {
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers,
    })
  } catch (err) {
    console.error("[storage/download] NextResponse stream error:", err)
    return jsonError("Failed to stream file", 500)
  }
}

/** OPTIONS preflight — middleware bu path için CORS yazmadığı (handler'a
 *  bırakıldı) için preflight'ı handler cevaplar. Wildcard public; private
 *  caller'lar simple GET attığı için preflight tetiklenmez. */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    },
  })
}
