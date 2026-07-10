import { NextRequest } from "next/server"
import { getAuthSession, jsonError, jsonSuccess, slugify } from "@workspace/console/lib/api-helpers"
import {
  companyModel,
  companyMemberModel,
  bucketModel,
  linearSettingsModel,
  linearImageAssetModel,
  linearPushSubscriptionModel,
  linearInboxSeenModel,
} from "@workspace/db/models"
import { cdnPurgeBucket } from "@workspace/cdn-client"
import { internalAuthHeaders } from "@workspace/console/lib/internal-auth"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await getAuthSession(request)
  if (!session) {
    return jsonError("Unauthorized", 401)
  }

  const { slug } = await params

  const company = await companyModel.findBySlug(slug)
  if (!company) {
    return jsonError("Company not found", 404)
  }

  const member = await companyMemberModel.findByCompanyAndUser(
    company.id,
    session.user.id,
  )
  if (!member) {
    return jsonError("You are not a member of this company", 403)
  }

  const members = await companyMemberModel.findByCompany(company.id)
  const memberCount = members.filter((m) => m.status === "active").length

  return jsonSuccess({
    ...company,
    memberCount,
    membership: {
      role: member.role,
      permissions: member.permissions,
      status: member.status,
    },
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await getAuthSession(request)
  if (!session) {
    return jsonError("Unauthorized", 401)
  }

  const { slug } = await params

  const company = await companyModel.findBySlug(slug)
  if (!company) {
    return jsonError("Company not found", 404)
  }

  const member = await companyMemberModel.findByCompanyAndUser(
    company.id,
    session.user.id,
  )
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    return jsonError("You do not have permission to update this company", 403)
  }

  let body: { name?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const updates: Record<string, unknown> = {}

  if (body.name && typeof body.name === "string" && body.name.trim()) {
    const name = body.name.trim()
    const newSlug = slugify(name)

    if (!newSlug) {
      return jsonError("Company name produces an invalid slug")
    }

    if (newSlug !== company.slug) {
      const existing = await companyModel.findBySlug(newSlug)
      if (existing) {
        return jsonError("A company with this name already exists")
      }
    }

    updates.name = name
    updates.slug = newSlug
  }

  if (Object.keys(updates).length === 0) {
    return jsonError("No valid fields to update")
  }

  const updated = await companyModel.updateById(company.id, updates as any)
  if (!updated) {
    return jsonError("Failed to update company", 500)
  }

  return jsonSuccess(updated)
}

/**
 * DELETE — cascade temizlik yapar. Sıra:
 *   1. Company'nin tüm bucket'larını cdn-server üzerinden purge et (S3
 *      objeleri + Media dokümanları); bu aşama fail olursa tüm silmeyi
 *      iptal et ki orphan S3 verisi kalmasın.
 *   2. Bucket dokümanlarını DB'den sil.
 *   3. Mail sentroy API key + domains + mailbox'lar cleanup için şu an
 *      bir hook yok — mail app'te `/api/companies/[slug]/cleanup-mail`
 *      gelecekte eklenince buraya da bağlanır; şimdilik orphan kalır.
 *   4. Company üyelerini sil, sonra company'nin kendisini.
 *
 * Silme öncesi `{ confirm: "<slug>" }` bekliyoruz.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await getAuthSession(request)
  if (!session) {
    return jsonError("Unauthorized", 401)
  }

  const { slug } = await params

  const company = await companyModel.findBySlug(slug)
  if (!company) {
    return jsonError("Company not found", 404)
  }

  const member = await companyMemberModel.findByCompanyAndUser(
    company.id,
    session.user.id,
  )
  if (!member || member.role !== "owner") {
    return jsonError("Only the owner can delete a company", 403)
  }

  let confirmSlug: string | undefined
  try {
    const body = await request.json().catch(() => null)
    confirmSlug = body?.confirm
  } catch {}
  if (confirmSlug !== undefined && confirmSlug !== company.slug) {
    return jsonError("Confirmation slug does not match", 400)
  }

  // 1. Bucket'ları cdn üzerinden purge — S3 ve Media docs dahil
  const buckets = await bucketModel.findByCompany(company.id)
  const purgeFailures: Array<{ bucketId: string; error: string }> = []
  for (const bucket of buckets) {
    try {
      const result = await cdnPurgeBucket({
        companyId: company.id,
        bucketId: bucket.id,
        userId: session.user.id,
      })
      if (!result.success || result.docsRemaining > 0) {
        purgeFailures.push({
          bucketId: bucket.id,
          error: `S3 failed: ${result.s3Failed.length}, docs remaining: ${result.docsRemaining}`,
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      purgeFailures.push({ bucketId: bucket.id, error: msg })
    }
  }

  if (purgeFailures.length > 0) {
    return jsonError(
      `Storage purge failed for ${purgeFailures.length} bucket(s); company not deleted. ` +
        `Retry or clean up manually: ${purgeFailures
          .map((f) => `${f.bucketId}: ${f.error}`)
          .join("; ")}`,
      502,
    )
  }

  // 2. Bucket dokümanlarını DB'den sil
  for (const bucket of buckets) {
    await bucketModel.deleteById(bucket.id)
  }

  // 3. Mail cleanup — sadece company provision edilmişse çağır. Mail app
  //    server-to-server INTERNAL_API_SECRET ile doğrular.
  let mailCleanup: unknown = null
  if (company.sentroyApiKey) {
    const mailUrl = process.env.MAIL_APP_URL
    if (!mailUrl) {
      return jsonError(
        "MAIL_APP_URL not configured — cannot cleanup mail resources",
        500,
      )
    }
    try {
      const res = await fetch(
        `${mailUrl.replace(/\/+$/, "")}/api/companies/${company.slug}/cleanup-mail`,
        {
          method: "POST",
          headers: internalAuthHeaders(),
        },
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        return jsonError(
          `Mail cleanup failed: ${json.error || res.status}. Company not deleted.`,
          502,
        )
      }
      mailCleanup = json.data
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return jsonError(
        `Mail cleanup request failed: ${msg}. Company not deleted.`,
        502,
      )
    }
  }

  // 3.5. Linear Lite verisi (shared Mongo) — best-effort, bloklamaz. Linear
  //      verisi tamamen bu DB'de: harici kaynak yok (mail'in aksine).
  //      Harici Linear webhook'u linear_settings silinince 503 döner; Linear
  //      başarısız webhook'u otomatik devre dışı bırakır (self-heal).
  try {
    await Promise.all([
      linearSettingsModel.deleteByCompany(company.id),
      linearImageAssetModel.deleteByCompany(company.id),
      linearPushSubscriptionModel.deleteByCompany(company.id),
      linearInboxSeenModel.deleteByCompany(company.id),
    ])
  } catch (err) {
    // Sil işlemini bloklamaz — orphan linear docs kurtarılabilir/zararsız.
    console.warn(
      `[company:delete] linear cleanup failed for ${company.id}:`,
      err instanceof Error ? err.message : err,
    )
  }

  // 4. Üyeleri + company'yi sil
  const members = await companyMemberModel.findByCompany(company.id)
  await Promise.all(members.map((m) => companyMemberModel.deleteById(m.id)))

  await companyModel.deleteById(company.id)

  return jsonSuccess({
    deleted: true,
    bucketsDeleted: buckets.length,
    mailCleanup,
  })
}
