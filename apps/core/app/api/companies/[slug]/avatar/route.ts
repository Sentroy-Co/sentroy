export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import {
  getAuthSession,
  jsonError,
  jsonSuccess,
} from "@workspace/console/lib/api-helpers"
import { companyModel, companyMemberModel, mediaModel } from "@workspace/db/models"
import { cdnUpload, cdnDelete } from "@workspace/cdn-client"
import { getOrCreateCompanyAvatarBucket } from "@/lib/company-avatar"
import { audit } from "@workspace/console/lib/audit"

/**
 * POST /api/companies/[slug]/avatar
 * multipart/form-data — field "file" (image/*)
 *
 * Company avatar upload. Sadece owner/admin yapabilir; eski avatar varsa
 * CDN'den silinir. Sonuç olarak company.avatarUrl güncellenir + dönen
 * URL UI tarafından team switcher / settings'te kullanılır.
 *
 * MAX_AVATAR_BYTES — kullanıcının zaten sıkıştırılmamış 30MB logo
 * yüklemesini istemiyoruz; 5MB üst sınır.
 */
const MAX_AVATAR_BYTES = 5 * 1024 * 1024

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
    return jsonError("Only owners and admins can change the avatar", 403)
  }

  // Content-type'a göre branch:
  //   - multipart/form-data → dosya upload (mevcut akış, CDN'e yazılır)
  //   - application/json    → MediaManager'dan dönen URL'i direkt set et
  //     (CDN'de zaten upload'lı bir media; biz sadece company.avatarUrl
  //     pointer'ını günceriz). Eski avatar varsa silinir.
  //
  // DB'ye yazılan URL host-agnostik **relative proxy** path'idir:
  //   `/api/companies/:slug/avatar/img/:mediaId`
  // CDN'in `BASE_URL` env'i yanlış set'liyse bile (örn localhost'a düşmüş)
  // tarayıcı her zaman aynı origin'den çağırır; proxy CDN'e server-to-server
  // fetch eder ve bytes stream eder.
  const contentType = request.headers.get("content-type") || ""

  if (contentType.includes("application/json")) {
    let body: { avatarUrl?: string | null }
    try {
      body = await request.json()
    } catch {
      return jsonError("Invalid JSON body")
    }
    const url = typeof body.avatarUrl === "string" ? body.avatarUrl.trim() : null
    if (!url) {
      return jsonError("avatarUrl required (string)")
    }

    // MediaManager URL'inden mediaId çıkar — CDN URL pattern `/f/<id>` veya
    // bizim relative proxy pattern `/avatar/img/<id>`. 24-char hex ObjectId.
    const mediaIdMatch = url.match(/\/(?:f|img)\/([0-9a-f]{24})(?:\/|$|\?)/)
    if (!mediaIdMatch || !mediaIdMatch[1]) {
      return jsonError("Could not extract mediaId from avatarUrl")
    }
    const mediaId = mediaIdMatch[1]

    const pickedMedia = await mediaModel.findById(mediaId)
    if (!pickedMedia || pickedMedia.companyId !== company.id) {
      return jsonError("Media not found", 404)
    }
    if (pickedMedia.type !== "image") {
      return jsonError("Only images can be used as an avatar")
    }
    const targetBucket = await getOrCreateCompanyAvatarBucket(company.id)
    const inAvatarBucket = pickedMedia.bucketId === targetBucket.id
    if (!inAvatarBucket && !pickedMedia.isPublic) {
      return jsonError(
        "Choose a public image for your profile avatar, or upload a file instead.",
      )
    }

    // Eski avatar varsa CDN'den temizle (yeni URL muhtemelen başka bir
    // media — orphan bırakmayalım). MediaManager seçimi mevcut bir
    // media'yı tekrar set ederse bile eski farklı olduğu sürece silinir.
    if (company.avatarUrl && !company.avatarUrl.includes(mediaId)) {
      const oldMediaIdMatch = company.avatarUrl.match(
        /\/(?:f|img)\/([0-9a-f]{24})(?:\/|$|\?)/,
      )
      const oldId = oldMediaIdMatch?.[1]
      if (oldId) {
        const oldDoc = await mediaModel.findById(oldId)
        const oldBucketId =
          oldDoc?.bucketId ?? targetBucket.id
        await cdnDelete(
          {
            companyId: company.id,
            bucketId: oldBucketId,
            userId: session.user.id,
            userEmail: session.user.email ?? undefined,
          },
          oldId,
        ).catch(() => {})
      }
    }

    const proxyUrl = `/api/companies/${slug}/avatar/img/${mediaId}`
    const updated = await companyModel.updateById(company.id, {
      avatarUrl: proxyUrl,
    } as Partial<typeof company>)
    if (!updated) return jsonError("Failed to persist avatar URL", 500)

    audit({
      request,
      userId: session.user.id,
      companyId: company.id,
      action: "avatar.pick",
      resource: "company",
      resourceId: company.id,
      details: { source: "media-manager", url },
    })

    return jsonSuccess({ avatarUrl: updated.avatarUrl })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return jsonError("Expected multipart/form-data or application/json body")
  }
  const file = form.get("file")
  if (!(file instanceof Blob) || file.size === 0) {
    return jsonError("No file provided")
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return jsonError(
      `Avatar file too large (max ${Math.round(MAX_AVATAR_BYTES / 1024 / 1024)}MB)`,
      413,
    )
  }
  const mime = (file as File).type || ""
  if (!mime.startsWith("image/")) {
    return jsonError("Only image files are accepted")
  }

  const bucket = await getOrCreateCompanyAvatarBucket(company.id)

  // Eski avatar varsa CDN'den temizle (orphan bırakmayalım). URL pattern'ı
  // hem yeni relative (`/avatar/img/<id>`) hem legacy CDN (`/f/<id>`)
  // formatlarını tanır.
  if (company.avatarUrl) {
    const oldIdMatch = company.avatarUrl.match(
      /\/(?:f|img)\/([0-9a-f]{24})(?:\/|$|\?)/,
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
  const filename = `avatar-${Date.now()}.${ext}`
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
      folder: "company-avatars",
      isPublic: true,
      alt: `${company.name} avatar`,
      tags: ["company-avatar", company.slug],
    },
  )

  // DB'ye relative proxy URL yaz (CDN URL host-agnostik proxy üzerinden
  // serve edilir, BASE_URL env yanlışlığında bile çalışır).
  const proxyUrl = `/api/companies/${slug}/avatar/img/${uploaded.mediaId}`
  const updated = await companyModel.updateById(company.id, {
    avatarUrl: proxyUrl,
  } as Partial<typeof company>)
  if (!updated) return jsonError("Failed to persist avatar URL", 500)

  audit({
    request,
    userId: session.user.id,
    companyId: company.id,
    action: "avatar.upload",
    resource: "company",
    resourceId: company.id,
    details: { fileSize: file.size, mime },
  })

  return jsonSuccess({ avatarUrl: updated.avatarUrl })
}

/**
 * DELETE /api/companies/[slug]/avatar
 * Avatar'ı kaldırır — CDN'den siler + DB'de avatarUrl = null.
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
    return jsonError("Only owners and admins can change the avatar", 403)
  }

  if (!company.avatarUrl) return jsonSuccess({ avatarUrl: null })

  // mediaId URL pattern'inden çıkar (relative `/avatar/img/<id>` veya
  // legacy CDN `/f/<id>`).
  const avatarBucket = await getOrCreateCompanyAvatarBucket(company.id)
  const mediaIdMatch = company.avatarUrl.match(
    /\/(?:f|img)\/([0-9a-f]{24})(?:\/|$|\?)/,
  )
  const mediaId = mediaIdMatch?.[1] ?? null
  if (mediaId) {
    const mediaDoc = await mediaModel.findById(mediaId)
    await cdnDelete(
      {
        companyId: company.id,
        bucketId: mediaDoc?.bucketId ?? avatarBucket.id,
        userId: session.user.id,
        userEmail: session.user.email ?? undefined,
      },
      mediaId,
    ).catch(() => {})
  }

  await companyModel.updateById(company.id, {
    avatarUrl: null,
  } as Partial<typeof company>)

  audit({
    request,
    userId: session.user.id,
    companyId: company.id,
    action: "avatar.remove",
    resource: "company",
    resourceId: company.id,
    details: {},
  })

  return jsonSuccess({ avatarUrl: null })
}
