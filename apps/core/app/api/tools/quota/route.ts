import { NextRequest } from "next/server"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { userToolEntitlementModel } from "@workspace/db/models"
import { packsForTool } from "@workspace/console/lib/tool-packs"

export const runtime = "nodejs"

/**
 * GET /api/tools/quota?toolKey=<tool> — giriş yapmış kullanıcının bir araç
 * için aktif kalan kredisi + satın alınabilir paketler. tools.sentroy.com
 * araç sayfası bakiye + fiyat listesi için çağırır (same-origin rewrite → core).
 * Oturum yoksa remaining=0 + paketler (anonim de fiyatları görebilsin).
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const toolKey = url.searchParams.get("toolKey")
  if (!toolKey) return jsonError("toolKey is required")

  const packs = packsForTool(toolKey).map((p) => ({
    key: p.key,
    credits: p.credits,
    unit: p.unit,
    priceUsd: p.priceUsd,
    name: p.name,
  }))

  const session = await getAuthSession(request)
  if (!session) {
    return jsonSuccess({ authenticated: false, remaining: 0, packs })
  }

  const remaining = await userToolEntitlementModel.activeRemaining(session.user.id, toolKey)
  return jsonSuccess({ authenticated: true, remaining, packs })
}
