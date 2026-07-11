export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import {
  getAuthSession,
  jsonError,
  jsonSuccess,
} from "@workspace/console/lib/api-helpers"
import { companyModel, companyMemberModel, mediaModel } from "@workspace/db/models"
import { cdnUpload, cdnDelete } from "@workspace/cdn-client"
import { getOrCreateCompanyCoverBucket } from "@/lib/company-avatar"
import { audit } from "@workspace/console/lib/audit"

/**
 * POST /api/companies/[slug]/cover
 * multipart/form-data — field "file" (image/*)
 *
 * Company cover/banner upload. Sadece owner/admin yapabilir; eski cover
 * bizim proxy path'imizse (yani biz upload etmişsek) CDN'den silinir.
 * Sonuç olarak company.coverImageUrl güncellenir + dönen URL UI tarafından
 * profile header / settings'te kullanılır.
 *
 * Bu endpoint settings PATCH'i bilerek bypass eder: PATCH `coverImageUrl`'i
 * sadece mutlak http(s) URL olarak kabul eder (MediaManager seçimi). Dosya
 * upload akışı ise host-agnostik **relative proxy** path yazar:
 *   `/api/companies/:slug/cover/img/:mediaId`
 * CDN'in `BASE_URL` env'i yanlış set'liyse bile tarayıcı her zaman aynı
 * origin'den çağırır; proxy CDN'e server-to-server fetch edip bytes stream
 * eder (avatar akışıyla aynı desen).
 *
 * MAX_COVER_BYTES — sıkıştırılmamış devasa banner'ları istemiyoruz; 5MB üst
 * sınır (avatar ile aynı).
 */
const MAX_COVER_BYTES = 5 * 1024 * 1024

/** DB'de tuttuğumuz mutlak (http/https) URL'ler MediaManager seçimidir —
 *  başka bir bucket'taki media'yı point eder, sahibi biz değiliz, silme.
 *  Sadece relative proxy path'ler (bizim upload'ımız) CDN'den silinir. */
function isOwnedProxyPath(url: string): boolean {
  return !/^https?:\/\//i.test(url)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)

  const { slug } = await params
  const company = await companyModel.findBySlug(slug)
  if (!company) return jsonError("Company not found", 404)

  const member = await companyMemberModel.findByCompanyAndUser(
    company.id,
    session.user.id,
  )
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    return jsonError("Only owners and admins can change the cover", 403)
  }

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
  if (file.size > MAX_COVER_BYTES) {
    return jsonError(
      `Cover file too large (max ${Math.round(MAX_COVER_BYTES / 1024 / 1024)}MB)`,
      413,
    )
  }
  const mime = (file as File).type || ""
  if (!mime.startsWith("image/")) {
    return jsonError("Only image files are accepted")
  }

  const bucket = await getOrCreateCompanyCoverBucket(company.id)

  // Eski cover varsa CDN'den temizle (orphan bırakmayalım). Sadece bizim
  // relative proxy path'imizi sileriz — mutlak MediaManager URL'leri başka
  // bir bucket'a ait olabilir, dokunmayız.
  if (company.coverImageUrl && isOwnedProxyPath(company.coverImageUrl)) {
    const oldIdMatch = company.coverImageUrl.match(
      /\/img\/([0-9a-f]{24})(?:\/|$|\?)/,
    )
    const oldId = oldIdMatch?.[1]
    if (oldId) {
      const oldDoc = await mediaModel.findById(oldId)
      await cdnDelete(
        {
          companyId: company.id,
          bucketId: oldDoc?.bucketId ?? bucket.id,
          userId: session.user.id,
          userEmail: session.user.email ?? undefined,
        },
        oldId,
      ).catch(() => {})
    }
  }

  const ext = mime.split("/")[1]?.split(";")[0] || "png"
  const filename = `cover-${Date.now()}.${ext}`
  const uploaded = await cdnUpload(
    {
      companyId: company.id,
      bucketId: bucket.id,
      userId: session.user.id,
      userEmail: session.user.email ?? undefined,
    },
    file,
    {
      filename,
      folder: "company-covers",
      isPublic: true,
      alt: `${company.name} cover`,
      tags: ["company-cover", company.slug],
    },
  )

  // DB'ye relative proxy URL yaz (host-agnostik proxy üzerinden serve edilir,
  // BASE_URL env yanlışlığında bile çalışır).
  const proxyUrl = `/api/companies/${slug}/cover/img/${uploaded.mediaId}`
  const updated = await companyModel.updateById(company.id, {
    coverImageUrl: proxyUrl,
  } as Partial<typeof company>)
  if (!updated) return jsonError("Failed to persist cover URL", 500)

  audit({
    request,
    userId: session.user.id,
    companyId: company.id,
    action: "company.cover.update",
    resource: "company",
    resourceId: company.id,
    details: { fileSize: file.size, mime },
  })

  return jsonSuccess({ coverUrl: updated.coverImageUrl })
}

/**
 * DELETE /api/companies/[slug]/cover
 * Cover'ı kaldırır — bizim proxy path'imizse CDN'den siler + DB'de
 * coverImageUrl = null.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)

  const { slug } = await params
  const company = await companyModel.findBySlug(slug)
  if (!company) return jsonError("Company not found", 404)

  const member = await companyMemberModel.findByCompanyAndUser(
    company.id,
    session.user.id,
  )
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    return jsonError("Only owners and admins can change the cover", 403)
  }

  if (!company.coverImageUrl) return jsonSuccess({ coverUrl: null })

  // Sadece bizim proxy path'imizi CDN'den sil — mutlak MediaManager URL'leri
  // başka bucket'a ait, dokunmayız (yalnız pointer'ı temizleriz).
  if (isOwnedProxyPath(company.coverImageUrl)) {
    const coverBucket = await getOrCreateCompanyCoverBucket(company.id)
    const mediaIdMatch = company.coverImageUrl.match(
      /\/img\/([0-9a-f]{24})(?:\/|$|\?)/,
    )
    const mediaId = mediaIdMatch?.[1] ?? null
    if (mediaId) {
      const mediaDoc = await mediaModel.findById(mediaId)
      await cdnDelete(
        {
          companyId: company.id,
          bucketId: mediaDoc?.bucketId ?? coverBucket.id,
          userId: session.user.id,
          userEmail: session.user.email ?? undefined,
        },
        mediaId,
      ).catch(() => {})
    }
  }

  await companyModel.updateById(company.id, {
    coverImageUrl: null,
  } as Partial<typeof company>)

  audit({
    request,
    userId: session.user.id,
    companyId: company.id,
    action: "company.cover.remove",
    resource: "company",
    resourceId: company.id,
    details: {},
  })

  return jsonSuccess({ coverUrl: null })
}
