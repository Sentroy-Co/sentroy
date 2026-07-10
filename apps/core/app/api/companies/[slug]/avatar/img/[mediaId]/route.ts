import { NextRequest, NextResponse } from "next/server"
import { jsonError } from "@workspace/console/lib/api-helpers"
import { companyModel, mediaModel } from "@workspace/db/models"
import { cdnFetchFile } from "@workspace/cdn-client"
import { getOrCreateCompanyAvatarBucket } from "@/lib/company-avatar"

/**
 * Public avatar proxy — auth gerektirmez, tarayıcı `<img src>`'iyle çağrılır.
 *
 * Avatar URL'leri DB'de **relative** path olarak tutulur:
 *   /api/companies/:slug/avatar/img/:mediaId
 * Böylece CDN'in `BASE_URL` env'i yanlış set'liyse bile (örn localhost'a
 * düşmüş olabilir) end-user'ın tarayıcısı her zaman aynı origin'den çağırır;
 * proxy CDN'e server-to-server fetch yapıp bytes stream eder.
 *
 * Validate: media aynı şirkete ait olmalı; ya avatar bucket'ındadır ya da
 * herkese açık (isPublic) bir görseldir — Media Manager'dan başka bucket
 * seçilebilsin diye.
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

  const avatarBucket = await getOrCreateCompanyAvatarBucket(company.id)
  const media = await mediaModel.findById(mediaId)
  if (!media || media.companyId !== company.id) {
    return jsonError("Avatar not found", 404)
  }
  const inAvatarBucket = media.bucketId === avatarBucket.id
  if (!inAvatarBucket && !media.isPublic) {
    return jsonError("Avatar not found", 404)
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
