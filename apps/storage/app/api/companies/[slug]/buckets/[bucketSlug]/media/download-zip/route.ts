import { NextRequest } from "next/server"
import { Readable } from "node:stream"
import archiver from "archiver"
import { jsonError } from "@workspace/console/lib/api-helpers"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { bucketModel, mediaModel } from "@workspace/db/models"
import { cdnFetchFile } from "@workspace/cdn-client"

/**
 * Toplu indirme — bir bucket'taki birden fazla media'yı zip olarak stream
 * eder. UI'daki "selected items > Download as zip" akışı için.
 *
 * Query: `?ids=a,b,c` (comma-separated). 100+ id verilirse 400 — büyük
 * batch'ler için ayrı bir bg job (Faz 2) yapılmalı.
 *
 * Akış:
 *   1. Caller'ın bucket'a erişimini doğrula.
 *   2. Her id için CDN'den parallel fetch (Promise.all).
 *   3. archiver pipe → response stream. Her response body'sini archive'e
 *      `originalName` ile append et.
 *   4. Tarayıcı `application/zip` olarak indirir.
 *
 * NOT: Memory'i şişirmemek için her CDN response'u kendi web stream'i
 * olarak archive'e geçer; tüm dosyalar buffer'lanmaz, gerçek streaming.
 */
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

  const idsParam = request.nextUrl.searchParams.get("ids")
  if (!idsParam) return jsonError("ids query required (comma-separated)")
  const ids = idsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  if (ids.length === 0) return jsonError("ids cannot be empty")
  if (ids.length > 100) {
    return jsonError("Too many items — max 100 per zip request", 413)
  }

  // Tüm media doc'larını paralel çek + bucket eşleşmesini doğrula
  const docs = await Promise.all(ids.map((id) => mediaModel.findById(id)))
  const valid = docs.filter(
    (d): d is NonNullable<typeof d> => d !== null && d.bucketId === bucket.id,
  )
  if (valid.length === 0) {
    return jsonError("No matching media in this bucket", 404)
  }

  // Archiver oluştur — Node Readable stream'e pipe edip Web ReadableStream'e
  // çevireceğiz (Next.js Edge/Node response için).
  const archive = archiver("zip", { zlib: { level: 6 } })
  archive.on("warning", (err: Error & { code?: string }) => {
    if (err.code !== "ENOENT") console.warn("[zip] warning:", err.message)
  })
  archive.on("error", (err: Error) => {
    console.error("[zip] error:", err.message)
  })

  // Her dosyayı CDN'den çekip archive'e ekle (paralel fetch + sequential
  // append; archiver kendi içinde sıraya alıyor).
  for (const doc of valid) {
    const upstream = await cdnFetchFile(doc.id, "original").catch(
      () => null,
    )
    if (!upstream || !upstream.ok || !upstream.body) {
      console.warn(`[zip] skip ${doc.id}: cdn fetch failed`)
      continue
    }
    // Web ReadableStream → Node Readable
    const nodeStream = Readable.fromWeb(
      upstream.body as unknown as Parameters<typeof Readable.fromWeb>[0],
    )
    archive.append(nodeStream, { name: doc.originalName })
  }

  archive.finalize().catch((e) => console.error("[zip] finalize error:", e))

  // Node Readable → Web ReadableStream
  const webStream = Readable.toWeb(archive) as unknown as ReadableStream

  const filename = `${bucket.slug}-${valid.length}-files.zip`
  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  })
}
