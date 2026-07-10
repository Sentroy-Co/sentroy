import { NextRequest } from "next/server"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { systemPurchaseModel } from "@workspace/db/models"

export const runtime = "nodejs"

/**
 * GET /api/billing/system-purchases?app=&reference=
 *
 * Giriş yapmış kullanıcının ödenmiş sistem ürünü satın alımları. Alt uygulamalar
 * (same-origin rewrite ile) ödemenin gerçekleştiğini SERVER-side doğrulamak için
 * çağırır (successUrl client-side, güvenilmez). `app`+`reference` ile filtrelenir.
 */
export async function GET(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)

  const sp = request.nextUrl.searchParams
  const app = sp.get("app") || undefined
  const reference = sp.get("reference") || undefined

  const purchases = await systemPurchaseModel.findByUser(session.user.id, { app, reference })
  return jsonSuccess(
    purchases.map((p) => ({
      id: p.id,
      app: p.app,
      reference: p.reference,
      amountUsd: p.amountUsd,
      createdAt: p.createdAt,
    })),
  )
}
