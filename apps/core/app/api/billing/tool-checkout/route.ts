import { NextRequest } from "next/server"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { audit } from "@workspace/console/lib/audit"
import { toolPackProductModel } from "@workspace/db/models"
import { findPack } from "@workspace/console/lib/tool-packs"
import { getPolarClient } from "@/lib/polar/client"

export const runtime = "nodejs"

/**
 * POST /api/billing/tool-checkout — { packKey, returnTo? }
 *
 * tools.sentroy.com ücretli araç paketleri için tek-seferlik Polar checkout.
 * Company-scoped DEĞİL — herhangi bir giriş yapmış kullanıcı satın alabilir.
 * downloader app bunu same-origin rewrite (`/api/billing/tool-checkout` → core)
 * ile çağırır; cookie forward edildiği için core oturumu görür. Webhook
 * metadata.type==="tool-pack" ile entitlement yaratır (reconcile.ts order.paid).
 */
export async function POST(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)

  let body: { packKey?: string; returnTo?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return jsonError("Invalid JSON body")
  }
  if (!body.packKey) return jsonError("packKey is required")

  const pack = findPack(body.packKey)
  if (!pack) return jsonError("Unknown pack", 404)

  const resolved = await getPolarClient()
  if (!resolved) return jsonError("Polar is not configured", 400)

  const productId = await toolPackProductModel.resolveProductId(pack.key, resolved.mode)
  if (!productId) {
    return jsonError(
      `Pack "${pack.key}" için ${resolved.mode} ortamında Polar ürünü tanımlı değil`,
      400,
    )
  }

  // successUrl: returnTo yalnız *.sentroy.com olabilir (open-redirect koruması).
  let successUrl = "https://tools.sentroy.com/?purchase=success"
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
        type: "tool-pack",
        userId: session.user.id,
        packKey: pack.key,
        toolKey: pack.toolKey,
      },
    })

    await audit({
      userId: session.user.id,
      action: "billing.tool-checkout.create",
      resource: "tool-pack",
      resourceId: pack.key,
      details: { mode: resolved.mode, productId },
      request,
    }).catch(() => {})

    return jsonSuccess({ url: checkout.url })
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Checkout failed", 502)
  }
}
