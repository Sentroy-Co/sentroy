import { NextRequest } from "next/server"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { authSessionModel, pushSubscriptionModel } from "@workspace/db/models"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/push/devices — kullanıcının bildirim cihazları (cihaz yönetim
 * ekranı). Yalnız KENDİ kayıtları; endpoint/token asla dönmez (gizlilik) —
 * uzaktan yönetim id üzerinden PATCH/DELETE ile yapılır.
 *
 * `current`: kayıt, isteği yapan oturuma bağlıysa true ("bu cihaz" rozeti).
 * `active`: kaydın bağlı olduğu oturum hâlâ canlıysa true; legacy kayıtlar
 * (sessionToken'sız) canlı sayılır. Ölü-oturum kayıtları dispatch anında
 * zaten purge edilir; burada da listelenirken işaretlenir.
 */
export async function GET(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session?.user?.id) return jsonError("Unauthorized", 401)

  const subs = await pushSubscriptionModel.listByUser(session.user.id)
  const tokens = subs.map((s) => s.sessionToken).filter((t): t is string => Boolean(t))
  const live = await authSessionModel.findLiveTokens(tokens)
  const currentToken = session.session?.token ?? null

  const devices = subs.map((s) => ({
    id: s.id,
    platform: s.platform ?? "web",
    deviceName: s.deviceName ?? null,
    userAgent: s.userAgent ?? null,
    enabled: s.enabled !== false,
    current: Boolean(currentToken && s.sessionToken === currentToken),
    active: !s.sessionToken || live.has(s.sessionToken),
    createdAt: s.createdAt,
    lastSeenAt: s.lastSeenAt ?? s.createdAt,
  }))

  return jsonSuccess({ devices })
}
