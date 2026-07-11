export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { getAuthSession, jsonError, jsonSuccess, slugify } from "@workspace/console/lib/api-helpers"
import { companyModel, companyMemberModel, planModel } from "@workspace/db/models"
import { SYSTEM_COMPANY_SLUG } from "@workspace/db/constants"
import type { Permission } from "@workspace/db/types"
import { WHATSAPP_LIMIT_DEFAULTS } from "@workspace/db/types"
import { PERMISSIONS } from "@workspace/auth/server/permissions"
import { internalAuthHeaders } from "@workspace/console/lib/internal-auth"
import { isFreeCompany, MAX_FREE_COMPANIES } from "@workspace/console/lib/company-limits"

/**
 * GET — kullanıcının üye olduğu tüm company'leri döner. Company selection
 * ekranı ve app picker bu endpoint'i kullanır. Cross-subdomain cookie ile
 * subdomain'ler de direkt çağırabilir (gerekirse CORS ile); şu an her app
 * aynı endpoint'i kendi domain'inde re-export ediyor.
 */
export async function GET(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) {
    return jsonError("Unauthorized", 401)
  }

  const memberships = await companyMemberModel.findByUser(session.user.id)

  const companies = await Promise.all(
    memberships.map(async (member) => {
      const company = await companyModel.findById(member.companyId)
      if (!company) return null
      // Shadow `__system` company user-facing list'lerde gözükmemeli;
      // admin'e atanmış olsa bile picker / sidebar / company selection'da
      // hidden. Admin-only endpoint'ler (`/api/admin/companies`, system-mail
      // sayfası) bunu hariç tutmaz, oralarda görünür.
      if (company.slug === SYSTEM_COMPANY_SLUG) return null
      return {
        ...company,
        membership: {
          role: member.role,
          permissions: member.permissions,
          status: member.status,
        },
      }
    }),
  )

  return jsonSuccess(companies.filter(Boolean))
}

/**
 * POST — company create. İşlem atomik:
 *   1. DB'ye company + owner membership yaz
 *   2. Mail app'in provision-mail endpoint'ine server-to-server POST
 *      (INTERNAL_API_SECRET ile) → `sentroyApiKey` dolar
 *   3. Provision başarısızsa membership + company rollback → 502
 *
 * Sonuç: "company var ama provisioned değil" durumu hiç oluşmaz. Mail app
 * dashboard'u her zaman hazır, user'a bekleme ekranı gösterilmez.
 *
 * Plan limitleri (maxCompanies) burada kontrol edilir — platform-level
 * kural.
 */
export async function POST(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) {
    return jsonError("Unauthorized", 401)
  }

  let body: { name?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    return jsonError("Company name is required")
  }

  const name = body.name.trim()
  const slug = slugify(name)

  if (!slug) {
    return jsonError("Company name produces an invalid slug")
  }

  const existingCompany = await companyModel.findBySlug(slug)
  if (existingCompany) {
    return jsonError("A company with this name already exists")
  }

  const userPlanId = (session.user as { planId?: string }).planId
  let userPlan = userPlanId ? await planModel.findById(userPlanId) : null
  if (!userPlan) {
    userPlan = await planModel.findDefault()
  }
  if (!userPlan) {
    return jsonError("No plan available", 500)
  }

  const ownedCompanies = await companyModel.findByOwnerId(session.user.id)
  if (ownedCompanies.length >= userPlan.maxCompanies) {
    return jsonError(
      `You have reached the maximum number of companies (${userPlan.maxCompanies}) for your plan`,
    )
  }
  // Yeni şirket daima free plan (defaultPlan) ile başlar → free-plan sahiplik
  // sınırı: bir kullanıcı en çok MAX_FREE_COMPANIES free şirkete sahip olabilir.
  if (ownedCompanies.filter(isFreeCompany).length >= MAX_FREE_COMPANIES) {
    return jsonError(
      `You can own at most ${MAX_FREE_COMPANIES} free-plan companies. Upgrade an existing company or transfer one to free up a slot.`,
    )
  }

  const defaultPlan = await planModel.findDefault()
  if (!defaultPlan) {
    return jsonError("No default plan available for company", 500)
  }

  const mailUrl = process.env.MAIL_APP_URL

  // Adım 1: DB'ye yaz
  const company = await companyModel.create({
    name,
    slug,
    ownerId: session.user.id,
    planId: defaultPlan.id,
    mailStorageLimit: defaultPlan.storageLimit,
    mailStorageUsed: 0,
    maxDomains: defaultPlan.maxDomainsPerCompany,
    maxMembers: defaultPlan.maxMembersPerCompany,
    maxMailboxes: defaultPlan.maxMailboxesPerCompany,
    maxContacts: defaultPlan.maxContacts,
    trashRetentionDays: defaultPlan.trashRetentionDays,
    monthlyEmailLimit: defaultPlan.monthlyEmailLimit,
    monthlyEmailsSent: 0,
    maxWhatsappNumbers:
      defaultPlan.maxWhatsappNumbers ?? WHATSAPP_LIMIT_DEFAULTS.maxNumbers,
    maxWhatsappTemplates:
      defaultPlan.maxWhatsappTemplates ?? WHATSAPP_LIMIT_DEFAULTS.maxTemplates,
    monthlyWhatsappLimit:
      defaultPlan.monthlyWhatsappLimit ?? WHATSAPP_LIMIT_DEFAULTS.monthlySends,
    sentroyApiKey: undefined,
  })

  const allPermissions = Object.values(PERMISSIONS) as Permission[]
  const ownerMember = await companyMemberModel.create({
    companyId: company.id,
    userId: session.user.id,
    role: "owner",
    status: "active",
    permissions: allPermissions,
  })

  // Adım 2: Mail provisioning — best-effort, fire-and-forget.
  //
  // Eskiden sync + fail durumunda komple rollback yapıyorduk; mail-server
  // down/yavaşken hiç company yaratamamayı sebep oluyordu (storage app için
  // bile şirket açamıyordun). Provision zaten LAZY — mail.sentroy.com layout
  // server-side `ensureMailProvisioned()` çağırıyor, key yoksa o anda
  // oluşturuluyor. Create flow'da provision'ı tetiklemek bonus (genelde key
  // hemen hazır olsun diye); fail olursa user mail'e ilk girdiğinde tetiklenir.
  //
  // 90s timeout — SDK default 30s mail-server'ın yavaş cold-start'ında
  // yetmiyor; backend response'u beklemeden 201 dönüyoruz, kullanıcı
  // company picker'a hemen gidebilir.
  if (mailUrl) {
    fetch(
      `${mailUrl.replace(/\/+$/, "")}/api/companies/${slug}/provision-mail`,
      {
        method: "POST",
        headers: {
          ...internalAuthHeaders(),
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(90_000),
      },
    )
      .then((res) => {
        if (!res.ok) {
          console.warn(
            `[companies/create] background provision failed for ${slug} (HTTP ${res.status}) — will retry on first mail page visit`,
          )
        }
      })
      .catch((err) => {
        console.warn(
          `[companies/create] background provision error for ${slug}:`,
          err instanceof Error ? err.message : err,
        )
      })
  } else {
    console.warn(
      "[companies/create] MAIL_APP_URL not configured — skipping background provision",
    )
  }

  // Member'ın oluşturulduğunu garantilemek için (lint için kullanılmamış uyarısı yememek için)
  void ownerMember
  return jsonSuccess(company, 201)
}
