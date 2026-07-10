import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertAdmin } from "@workspace/console/lib/admin-access"
import { audit } from "@workspace/console/lib/audit"
import { toolPackProductModel } from "@workspace/db/models"
import { TOOL_PACKS } from "@workspace/console/lib/tool-packs"

/**
 * tools.sentroy.com ücretli paket → Polar productId eşlemesi yönetimi (admin).
 * Operatör Polar'da yarattığı tek-seferlik ürünlerin id'lerini buradan paketlere
 * bağlar. productId secret değildir (plaintext saklanır). Pack yapısı koddadır.
 *
 * GET  /api/admin/billing/tool-products → mevcut eşleme + kod kataloğu
 * PUT  /api/admin/billing/tool-products → { mode, products: { packKey: productId } }
 */
export async function GET(request: NextRequest) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error

  const settings = await toolPackProductModel.get()
  return jsonSuccess({
    packs: TOOL_PACKS.map((p) => ({
      key: p.key,
      toolKey: p.toolKey,
      credits: p.credits,
      unit: p.unit,
      priceUsd: p.priceUsd,
      name: p.name,
    })),
    sandbox: settings.sandbox,
    production: settings.production,
  })
}

export async function PUT(request: NextRequest) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error

  let body: { mode?: string; products?: Record<string, unknown> }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return jsonError("Invalid JSON body")
  }

  const mode = body.mode === "production" ? "production" : body.mode === "sandbox" ? "sandbox" : null
  if (!mode) return jsonError("mode must be 'sandbox' or 'production'")
  if (!body.products || typeof body.products !== "object") {
    return jsonError("products object is required")
  }

  const validKeys = new Set(TOOL_PACKS.map((p) => p.key))
  const next: Record<string, string> = {}
  for (const [packKey, productId] of Object.entries(body.products)) {
    if (!validKeys.has(packKey)) return jsonError(`Unknown pack key: ${packKey}`, 400)
    if (productId === null || productId === "") continue // boş → eşlemeyi atla
    if (typeof productId !== "string") return jsonError(`productId for ${packKey} must be a string`)
    next[packKey] = productId.trim()
  }

  await toolPackProductModel.update({ [mode]: next })

  await audit({
    userId: access.session.user.id,
    action: "billing.tool-products.update",
    resource: "tool-pack-products",
    details: { mode, packKeys: Object.keys(next) },
    request,
  }).catch(() => {})

  const settings = await toolPackProductModel.get()
  return jsonSuccess({ sandbox: settings.sandbox, production: settings.production })
}
