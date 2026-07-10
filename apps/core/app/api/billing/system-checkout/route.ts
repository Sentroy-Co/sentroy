import { NextRequest } from "next/server"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { audit } from "@workspace/console/lib/audit"
import { systemProductModel } from "@workspace/db/models"
import { isSystemProductAmount, amountKey } from "@workspace/console/lib/system-products"
import { getPolarClient } from "@/lib/polar/client"

export const runtime = "nodejs"

/**
 * POST /api/billing/system-checkout — { amount, app?, reference?, returnTo? }
 *
 * Sistem (ilk-parti) tek-seferlik ürünleri için generic Polar checkout. Herhangi
 * bir alt uygulama (mail/storage/studio…) istediği tutarda (5/10/20/50/100$)
 * satın alma başlatır; same-origin rewrite (`/api/billing/system-checkout` →
 * core) ile çağrılır, cookie forward edildiğinden core oturumunu görür. Ödeme
 * webhook'u metadata.type==="system-product" ile system_purchases'a kayıt düşer
 * (reconcile.ts). `app`+`reference` ile alt uygulama satın alımı eşler.
 */
export async function POST(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)

  let body: { amount?: number; app?: string; reference?: string; returnTo?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return jsonError("Invalid JSON body")
  }

  const amount = typeof body.amount === "number" ? body.amount : Number(body.amount)
  if (!isSystemProductAmount(amount)) {
    return jsonError("amount must be one of 5, 10, 20, 50, 100")
  }
  const app = typeof body.app === "string" ? body.app.slice(0, 64) : null
  const reference = typeof body.reference === "string" ? body.reference.slice(0, 200) : null

  const resolved = await getPolarClient()
  if (!resolved) return jsonError("Polar is not configured", 400)

  const productId = await systemProductModel.resolveProductId(amountKey(amount), resolved.mode)
  if (!productId) {
    return jsonError(
      `$${amount} ürünü için ${resolved.mode} ortamında Polar ürünü tanımlı değil`,
      400,
    )
  }

  // successUrl: returnTo yalnız *.sentroy.com olabilir (open-redirect koruması).
  let successUrl = "https://sentroy.com/?purchase=success"
  if (
    body.returnTo &&
    /^https:\/\/([a-z0-9-]+\.)?sentroy\.com(\/|$|\?)/i.test(body.returnTo)
  ) {
    successUrl = body.returnTo + (body.returnTo.includes("?") ? "&" : "?") + "purchase=success"
  }

  try {
    const checkout = await resolved.client.checkouts.create({
      products: [productId],
      externalCustomerId: `user-${session.user.id}`,
      customerEmail: session.user.email ?? undefined,
      successUrl,
      metadata: {
        type: "system-product",
        userId: session.user.id,
        amountUsd: amount,
        app: app ?? "",
        reference: reference ?? "",
      },
    })

    await audit({
      userId: session.user.id,
      action: "billing.system-checkout.create",
      resource: "system-product",
      resourceId: amountKey(amount),
      details: { mode: resolved.mode, productId, app, reference },
      request,
    }).catch(() => {})

    return jsonSuccess({ url: checkout.url })
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Checkout failed", 502)
  }
}
