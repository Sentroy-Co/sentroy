import { NextRequest, NextResponse } from "next/server"
import { jsonError } from "@workspace/console/lib/api-helpers"
import { companyModel, mediaModel } from "@workspace/db/models"
import { cdnFetchFile } from "@workspace/cdn-client"
import { getOrCreateCompanyCoverBucket } from "@/lib/company-avatar"

/**
 * Public cover proxy — auth gerektirmez, tarayıcı `<img src>`'iyle çağrılır.
 *
 * Cover URL'leri DB'de **relative** path olarak tutulur:
 *   /api/companies/:slug/cover/img/:mediaId
 * Böylece CDN'in `BASE_URL` env'i yanlış set'liyse bile (örn localhost'a
 * düşmüş olabilir) end-user'ın tarayıcısı her zaman aynı origin'den çağırır;
 * proxy CDN'e server-to-server fetch yapıp bytes stream eder.
 *
 * Validate: media aynı şirkete ait olmalı; ya cover bucket'ındadır ya da
 * herkese açık (isPublic) bir görseldir — Media Manager'dan başka bucket
 * seçilebilsin diye (avatar proxy'siyle aynı desen).
 */
export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ slug: string; mediaId: string }>
  },
) {
  const { slug, mediaId } = await params

  const company = await companyModel.findBySlug(slug)
  if (!company) return jsonError("Company not found", 404)

  const coverBucket = await getOrCreateCompanyCoverBucket(company.id)
  const media = await mediaModel.findById(mediaId)
  if (!media || media.companyId !== company.id) {
    return jsonError("Cover not found", 404)
  }
  const inCoverBucket = media.bucketId === coverBucket.id
  if (!inCoverBucket && !media.isPublic) {
    return jsonError("Cover not found", 404)
  }

  const upstream = await cdnFetchFile(mediaId, "original")
  if (!upstream.ok || !upstream.body) {
    return jsonError(`CDN fetch failed (${upstream.status})`, 502)
  }

  const headers = new Headers()
  for (const h of ["content-type", "content-length", "etag", "last-modified"]) {
    const v = upstream.headers.get(h)
    if (v) headers.set(h, v)
  }
  headers.set("Cache-Control", "public, max-age=31536000, immutable")

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers,
  })
}
