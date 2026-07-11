export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertAdmin } from "@workspace/console/lib/admin-access"
import { audit } from "@workspace/console/lib/audit"
import { systemProductModel } from "@workspace/db/models"
import { SYSTEM_PRODUCT_AMOUNTS, amountKey } from "@workspace/console/lib/system-products"

/**
 * Sistem (ilk-parti) tek-seferlik ürün → Polar productId eşlemesi yönetimi.
 * Operatör Polar'da yarattığı sabit-tutarlı ürünlerin id'lerini buradan
 * tutarlara bağlar (sandbox + production ayrı). productId secret değildir.
 * Tutar kataloğu koddadır (SYSTEM_PRODUCT_AMOUNTS).
 *
 * GET  /api/admin/billing/system-products → mevcut eşleme + tutar kataloğu
 * PUT  /api/admin/billing/system-products → { mode, products: { amountKey: productId } }
 */
export async function GET(request: NextRequest) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error

  const settings = await systemProductModel.get()
  return jsonSuccess({
    amounts: SYSTEM_PRODUCT_AMOUNTS,
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

  const validKeys = new Set(SYSTEM_PRODUCT_AMOUNTS.map((a) => amountKey(a)))
  const next: Record<string, string> = {}
  for (const [key, productId] of Object.entries(body.products)) {
    if (!validKeys.has(key)) return jsonError(`Unknown amount key: ${key}`, 400)
    if (productId === null || productId === "") continue // boş → eşlemeyi atla
    if (typeof productId !== "string") return jsonError(`productId for ${key} must be a string`)
    next[key] = productId.trim()
  }

  await systemProductModel.update({ [mode]: next })

  await audit({
    userId: access.session.user.id,
    action: "billing.system-products.update",
    resource: "system-products",
    details: { mode, amountKeys: Object.keys(next) },
    request,
  }).catch(() => {})

  const settings = await systemProductModel.get()
  return jsonSuccess({ sandbox: settings.sandbox, production: settings.production })
}
