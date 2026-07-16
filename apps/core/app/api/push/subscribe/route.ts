import { NextRequest } from "next/server"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { pushSubscriptionModel } from "@workspace/db/models"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Platform Web Push aboneliği — **user-scoped** (bkz. push-subscription model).
 * OS bildirim toggle'ı buraya bağlanır. POST → abone ol (opt-in), DELETE →
 * çık (opt-out). Session (cookie) yeterli; company scope YOK — abonelik
 * kullanıcı-seviye, mail geldiğinde hedef şirket dispatch anında çözülür.
 */

/** UA'dan cihaz listesi için okunabilir ad üret ("Chrome · macOS" gibi). */
function deviceNameFromUa(ua: string | null): string | null {
  if (!ua) return null
  const browser = /edg\//i.test(ua)
    ? "Edge"
    : /opr\//i.test(ua)
      ? "Opera"
      : /firefox\//i.test(ua)
        ? "Firefox"
        : /chrome\//i.test(ua)
          ? "Chrome"
          : /safari\//i.test(ua)
            ? "Safari"
            : "Browser"
  const os = /windows/i.test(ua)
    ? "Windows"
    : /mac os x|macintosh/i.test(ua)
      ? "macOS"
      : /android/i.test(ua)
        ? "Android"
        : /iphone|ipad|ios/i.test(ua)
          ? "iOS"
          : /linux/i.test(ua)
            ? "Linux"
            : null
  return os ? `${browser} · ${os}` : browser
}

export async function POST(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session?.user?.id) return jsonError("Unauthorized", 401)

  const body = (await request.json().catch(() => null)) as {
    endpoint?: string
    keys?: { p256dh?: string; auth?: string }
  } | null
  const endpoint = body?.endpoint
  const p256dh = body?.keys?.p256dh
  const auth = body?.keys?.auth
  if (!endpoint || !p256dh || !auth) {
    return jsonError("Invalid subscription", 400)
  }

  const userAgent = request.headers.get("user-agent")
  await pushSubscriptionModel.upsertByEndpoint({
    userId: session.user.id,
    endpoint,
    p256dh,
    auth,
    userAgent,
    deviceName: deviceNameFromUa(userAgent),
    // Kaydı bu oturuma bağla — çıkış/revoke/expiry sonrası dispatch temizler.
    sessionToken: session.session?.token ?? null,
  })

  return jsonSuccess({ subscribed: true })
}

export async function DELETE(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session?.user?.id) return jsonError("Unauthorized", 401)

  const body = (await request.json().catch(() => null)) as {
    endpoint?: string
  } | null
  if (body?.endpoint) {
    // Sahiplik-korumalı: yalnız kendi kaydını silebilir.
    await pushSubscriptionModel.deleteByEndpointForUser(body.endpoint, session.user.id)
  }
  return jsonSuccess({ subscribed: false })
}
