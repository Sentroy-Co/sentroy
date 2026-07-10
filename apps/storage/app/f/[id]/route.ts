import { NextRequest, NextResponse } from "next/server"
import { jsonError } from "@workspace/console/lib/api-helpers"
import { bucketModel, mediaModel } from "@workspace/db/models"
import { isSystemManagedBucketSlug } from "@workspace/db/constants"
import { cdnFetchFile, cdnFetchConverted } from "@workspace/cdn-client"

/**
 * Next 15 Route Handler'larında dinamik header / DB read olduğu için zaten
 * "force-dynamic" davranıyor; explicit yazıp default'lara güvenmiyoruz.
 * Cache stratejisini handler içinde header üzerinden yönetiyoruz.
 */
export const dynamic = "force-dynamic"

/**
 * Kısa public dosya URL'i: `/f/[id]` ve isteğe bağlı `/f/[id]/[filename]`.
 *
 * Yalnızca **public bucket + public media** kombinasyonuna cevap verir;
 * private dosyalar 404 döner ki kısa URL üzerinden enumeration / leak
 * mümkün olmasın. Auth-less olduğu için Next.js middleware veya proxy
 * arkasında ek bir CDN cache'i de devreye girebilir.
 *
 * Query params (`/api/.../download` ile aynı kontrat):
 *   - quality=NN     → thumbnail variant
 *   - format=xxx     → on-the-fly convert (CDN /convert)
 *   - q=NN, page=NN  → convert opsiyonları
 *   - download=1     → Content-Disposition: attachment
 *   - filename=x.jpg → custom dosya adı (path'in `/filename` kısmından
 *                       da gelebilir, query öncelikli)
 *
 * System-managed bucket'lar (örn avatar, template-thumbnail) bu kısa
 * URL üzerinden çıkmaz — kendi özel public route'ları var.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!id) return jsonError("Not found", 404)

  const media = await mediaModel.findById(id)
  if (!media || !media.isPublic) return jsonError("Not found", 404)

  const bucket = await bucketModel.findById(media.bucketId)
  if (!bucket || !bucket.isPublic) return jsonError("Not found", 404)
  if (isSystemManagedBucketSlug(bucket.slug)) {
    return jsonError("Not found", 404)
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
      const q = parseInt(sp.get("q") || "", 10) || undefined
      const page = parseInt(sp.get("page") || "", 10) || undefined
      upstream = await cdnFetchConverted(media.id, format, {
        q,
        page,
        download: wantDownload,
        filename: clientFilename,
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
        // Tarayıcı Range'ini CDN'e ilet → audio/video seek + duration (206).
        range: request.headers.get("range") ?? undefined,
      })
    }
  } catch (err) {
    console.error("[storage/f/short] CDN fetch error:", err)
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
    // Range/seek — audio/video oynatıcı duration + seek için 206 + bunları ister.
    "content-range",
    "accept-ranges",
  ]
  for (const h of passthrough) {
    const v = upstream.headers.get(h)
    if (!v) continue
    try {
      headers.set(h, v)
    } catch {
      /* skip invalid */
    }
  }
  // Public: edge / CDN cache OK. Variant'lar için 1 gün immutable;
  // original için 5 dk (silme/replace ihtimali).
  const isVariant = sp.has("quality") || Boolean(format)
  headers.set(
    "Cache-Control",
    isVariant ? "public, max-age=86400, immutable" : "public, max-age=300",
  )

  // CORS: public dosya endpoint'i, herhangi bir origin'den (3rd-party
  // siteler, demo'lar, başka subdomain'ler) <img> / <video> / fetch
  // çalışsın diye wildcard. Credentials gerekmez (hem zaten cookie auth
  // bypass edildi); `*` + `credentials: include` zaten browser tarafından
  // reddedilir, dolayısıyla wildcard güvenli.
  headers.set("Access-Control-Allow-Origin", "*")
  headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
  headers.set("Cross-Origin-Resource-Policy", "cross-origin")

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers,
  })
}

/** OPTIONS preflight — herhangi bir origin'in fetch'iyle simple olmayan
 *  request'lerde (custom headers, vb) tetiklenir. Wildcard CORS açıkça
 *  set edilmiş simple GET için aslında preflight tetiklenmez ama caller'ın
 *  guard koymasını engellememek için tutarlı 204 dönelim. */
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
