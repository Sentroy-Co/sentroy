export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { sentroyAppModel, appInstallModel, companyModel, companyMemberModel } from "@workspace/db/models"
import { audit } from "@workspace/console/lib/audit"
import type { OAuthScope } from "@workspace/db/models/oauth-client"
import { isFirstPartyAppId, firstPartyInstallId } from "@/lib/app-store/first-party-catalog"

/** appId burada manifest identity.id (3rd-party) VEYA first-party ham id. */
async function resolve(req: NextRequest, appId: string) {
  const session = await getAuthSession(req)
  if (!session) return { error: jsonError("Unauthorized", 401) }
  const app = await sentroyAppModel.findByAppId(appId)
  if (!app) return { error: jsonError("App not found", 404) }
  return { session, app }
}

/** Aktif üye kontrolü — session + companySlug → { session, company }. */
async function resolveMemberCompany(req: NextRequest, companySlug: string | null | undefined) {
  const session = await getAuthSession(req)
  if (!session) return { error: jsonError("Unauthorized", 401) }
  if (!companySlug) return { error: jsonError("company required", 400) }
  const company = await companyModel.findBySlug(companySlug)
  if (!company) return { error: jsonError("Company not found", 404) }
  const member = await companyMemberModel.findByCompanyAndUser(company.id, session.user.id)
  if (!member || member.status !== "active") return { error: jsonError("Not a member of this company", 403) }
  return { session, company }
}

/**
 * First-party (status/whatsapp/studio/opencut) kurulumu — SentroyApp/paid/
 * private/origin mantığını ATLAR. app_installs'a sentinel appId `fp:<id>` ile
 * yazılır (unique index korunur). Hepsi free + public + approved varsayılır.
 */
async function installFirstParty(req: NextRequest, appId: string) {
  let body: { companySlug?: string }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return jsonError("Invalid JSON", 400)
  }
  const r = await resolveMemberCompany(req, body.companySlug)
  if ("error" in r) return r.error
  const { session, company } = r

  const { install, created } = await appInstallModel.activate({
    appId: firstPartyInstallId(appId),
    userId: session.user.id,
    companyId: company.id,
  })

  await audit({
    userId: session.user.id,
    companyId: company.id,
    action: "app.install",
    resource: "app",
    resourceId: firstPartyInstallId(appId),
    details: { appId, firstParty: true },
    request: req,
  })

  return jsonSuccess({ installed: true, id: install.id, firstParty: true }, created ? 201 : 200)
}

async function uninstallFirstParty(req: NextRequest, appId: string) {
  const slug = new URL(req.url).searchParams.get("company")
  const r = await resolveMemberCompany(req, slug)
  if ("error" in r) return r.error
  const { session, company } = r

  const install = await appInstallModel.findActive(session.user.id, firstPartyInstallId(appId), company.id)
  if (!install) return jsonSuccess({ uninstalled: true }) // zaten kurulu değil
  await appInstallModel.uninstall(install.id)

  await audit({
    userId: session.user.id,
    companyId: company.id,
    action: "app.uninstall",
    resource: "app",
    resourceId: firstPartyInstallId(appId),
    details: { appId, firstParty: true },
    request: req,
  })

  return jsonSuccess({ uninstalled: true, firstParty: true })
}

/** POST { companySlug, consentedScopes? } → kurar. Ücretsiz app; ücretli → 402. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params

  // First-party ham id → manifest yolunu atla.
  if (isFirstPartyAppId(appId)) return installFirstParty(req, appId)

  const r = await resolve(req, appId)
  if ("error" in r) return r.error
  const { session, app } = r

  if (app.status !== "approved" || !app.enabled) return jsonError("App not available", 404)

  let body: { companySlug?: string; consentedScopes?: string[] }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return jsonError("Invalid JSON", 400)
  }
  if (!body.companySlug) return jsonError("companySlug required", 400)

  const company = await companyModel.findBySlug(body.companySlug)
  if (!company) return jsonError("Company not found", 404)

  const member = await companyMemberModel.findByCompanyAndUser(company.id, session.user.id)
  if (!member || member.status !== "active") return jsonError("Not a member of this company", 403)

  // Private (şirkete-özel) app yalnız sahibi şirkette kurulabilir (o şirketin üyeleri).
  if (app.visibility === "private" && company.id !== app.developerCompanyId) {
    return jsonError("Not found", 404)
  }

  if (app.pricing.model === "paid") {
    return jsonError("Paid apps require checkout (coming soon)", 402)
  }

  // Onaylanan scope'ları app'in istediğiyle kesiştir (fazlasını kabul etme).
  const consented = (body.consentedScopes ?? []).filter((s): s is OAuthScope =>
    app.requiredScopes.includes(s as OAuthScope),
  )

  const { install, created } = await appInstallModel.activate({
    appId: app.id,
    userId: session.user.id,
    companyId: company.id,
    consentedScopes: consented,
  })
  if (created) await sentroyAppModel.adjustInstallCount(app.id, 1)

  await audit({
    userId: session.user.id,
    companyId: company.id,
    action: "app.install",
    resource: "app",
    resourceId: app.id,
    details: { appId: app.appId },
    request: req,
  })

  return jsonSuccess({ installed: true, id: install.id }, created ? 201 : 200)
}

/** DELETE ?company=slug → kaldırır. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params

  if (isFirstPartyAppId(appId)) return uninstallFirstParty(req, appId)

  const r = await resolve(req, appId)
  if ("error" in r) return r.error
  const { session, app } = r

  const slug = new URL(req.url).searchParams.get("company")
  if (!slug) return jsonError("company required", 400)
  const company = await companyModel.findBySlug(slug)
  if (!company) return jsonError("Company not found", 404)

  const install = await appInstallModel.findActive(session.user.id, app.id, company.id)
  if (!install) return jsonSuccess({ uninstalled: true }) // zaten kurulu değil
  await appInstallModel.uninstall(install.id)
  await sentroyAppModel.adjustInstallCount(app.id, -1)

  await audit({
    userId: session.user.id,
    companyId: company.id,
    action: "app.uninstall",
    resource: "app",
    resourceId: app.id,
    details: { appId: app.appId },
    request: req,
  })

  return jsonSuccess({ uninstalled: true })
}
