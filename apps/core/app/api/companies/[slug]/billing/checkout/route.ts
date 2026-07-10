import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyOwnerOrAdmin } from "@workspace/console/lib/company-access"
import { audit } from "@workspace/console/lib/audit"
import { companyModel, planModel } from "@workspace/db/models"
import { getPolarClient } from "@/lib/polar/client"
import { resolvePlanProduct } from "@/lib/polar/reconcile"

export const runtime = "nodejs"

/**
 * POST /api/companies/[slug]/billing/checkout — { planId, interval, lang }
 * Aktif Polar ortamında bir checkout session oluşturup hosted URL döner.
 * Company `external_customer_id` ile bağlanır; webhook bununla eşleştirir.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyOwnerOrAdmin(request, slug)
  if ("error" in access) return access.error

  let body: { planId?: string; interval?: string; lang?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (!body.planId) return jsonError("planId is required")
  const interval = body.interval === "year" ? "year" : "month"
  const lang = body.lang === "tr" ? "tr" : "en"

  const plan = await planModel.findById(body.planId)
  if (!plan) return jsonError("Plan not found", 404)

  const resolved = await getPolarClient()
  if (!resolved) return jsonError("Polar is not configured", 400)

  const productId = resolvePlanProduct(plan, resolved.mode, interval)
  if (!productId) {
    return jsonError(
      `Plan has no Polar product for ${interval} in ${resolved.mode}`,
      400,
    )
  }

  const company = await companyModel.findById(access.companyId)
  if (!company) return jsonError("Company not found", 404)

  const origin =
    request.headers.get("origin") ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://sentroy.com"
  const successUrl = `${origin}/${lang}/d/${slug}/billing?checkout=success`

  try {
    const checkout = await resolved.client.checkouts.create({
      products: [productId],
      externalCustomerId: company.id,
      customerEmail: access.session?.user.email ?? undefined,
      successUrl,
      metadata: {
        companyId: company.id,
        companySlug: slug,
        planId: plan.id,
        interval,
      },
    })

    await audit({
      userId: access.session?.user.id ?? "system",
      companyId: company.id,
      action: "billing.checkout.create",
      resource: "polar-checkout",
      resourceId: checkout.id,
      details: { planId: plan.id, interval, mode: resolved.mode },
      request,
    }).catch(() => {})

    return jsonSuccess({ url: checkout.url })
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "Failed to create checkout",
      502,
    )
  }
}
