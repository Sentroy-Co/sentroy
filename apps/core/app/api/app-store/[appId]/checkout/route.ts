export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { audit } from "@workspace/console/lib/audit"
import { sentroyAppModel, companyModel, companyMemberModel } from "@workspace/db/models"
import { getPolarClient } from "@/lib/polar/client"

export const runtime = "nodejs"

/**
 * POST /api/app-store/[appId]/checkout — { companySlug, returnTo? }
 *
 * Ücretli App Store uygulaması için Polar checkout. Webhook (reconcile.ts)
 * metadata.type==="app-purchase" ile AppInstall'u aktive eder. appId = manifest
 * identity.id. successUrl yalnız *.sentroy.com (open-redirect koruması).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ appId: string }> }) {
  const session = await getAuthSession(req)
  if (!session) return jsonError("Unauthorized", 401)
  const { appId } = await params

  const app = await sentroyAppModel.findByAppId(appId)
  if (!app || app.status !== "approved" || !app.enabled || app.visibility !== "public") {
    return jsonError("App not available", 404)
  }
  const polar = app.pricing.polar
  if (app.pricing.model !== "paid" || !polar || polar.productIds.length === 0) {
    return jsonError("App is not paid", 400)
  }

  let body: { companySlug?: string; returnTo?: string }
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

  const resolved = await getPolarClient()
  if (!resolved) return jsonError("Polar is not configured", 400)
  if (polar.mode !== resolved.mode) {
    return jsonError(`App is configured for Polar ${polar.mode} but the platform is in ${resolved.mode}`, 400)
  }

  let successUrl = `https://sentroy.com/${"en"}?purchase=success`
  if (body.returnTo && /^https:\/\/([a-z0-9-]+\.)?sentroy\.com(\/|$|\?)/i.test(body.returnTo)) {
    successUrl = body.returnTo + (body.returnTo.includes("?") ? "&" : "?") + "purchase=success"
  }

  try {
    const checkout = await resolved.client.checkouts.create({
      products: [polar.productIds[0]!],
      externalCustomerId: `user-${session.user.id}`,
      customerEmail: session.user.email ?? undefined,
      successUrl,
      metadata: {
        type: "app-purchase",
        appId: app.id, // DB id — reconcile AppInstall için
        manifestAppId: app.appId,
        userId: session.user.id,
        companyId: company.id,
        kind: polar.kind,
      },
    })

    await audit({
      userId: session.user.id,
      companyId: company.id,
      action: "app.checkout.create",
      resource: "app",
      resourceId: app.id,
      details: { mode: resolved.mode, kind: polar.kind },
      request: req,
    }).catch(() => {})

    return jsonSuccess({ url: checkout.url })
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Checkout failed", 502)
  }
}
