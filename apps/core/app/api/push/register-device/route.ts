import { NextRequest } from "next/server"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { pushSubscriptionModel } from "@workspace/db/models"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Mobile device-token registration — user-scoped, session (cookie) auth.
 * The Flutter mail app registers its push token here after sign-in:
 *   • iOS   → APNs hex device token (platform "apns")
 *   • Android → FCM registration token (platform "fcm")
 * The same mail-server→core dispatch that fans out Web Push also pushes to these
 * tokens (see lib/push.dispatchToUsers). POST → opt-in, DELETE → opt-out.
 * Both live in the shared `push_subscriptions` collection.
 */
export async function POST(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session?.user?.id) return jsonError("Unauthorized", 401)

  const body = (await request.json().catch(() => null)) as {
    platform?: string
    token?: string
    deviceName?: string
    bundleId?: string
  } | null

  const token = body?.token?.trim()
  const platform = body?.platform
  // APNs apns-topic = app bundle id (mail ≠ meet). iOS'ta client bildirir;
  // yoksa dispatch APNS_BUNDLE_ID env'ine düşer (eski kayıtlar / geriye-uyum).
  const rawBundle = body?.bundleId?.trim()
  const bundleId = rawBundle && /^[A-Za-z0-9.-]{3,100}$/.test(rawBundle) ? rawBundle : null
  // APNs: 16-200 hex. FCM: uzun opaque token (harf/rakam/-/_/:), 100-400 char.
  const validApns = platform === "apns" && !!token && /^[0-9a-fA-F]{16,200}$/.test(token)
  const validFcm = platform === "fcm" && !!token && /^[A-Za-z0-9_:.-]{100,400}$/.test(token)
  if (!token || (!validApns && !validFcm)) {
    return jsonError("Invalid device registration", 400)
  }
  // Cihaz listesi ekranında görünen ad — client bildirir, 80 char'a kırpılır.
  const deviceName = body?.deviceName?.trim().slice(0, 80) || null

  await pushSubscriptionModel.upsertDevice({
    userId: session.user.id,
    deviceToken: token,
    platform: platform as "apns" | "fcm",
    bundleId: validApns ? bundleId : null,
    userAgent: request.headers.get("user-agent"),
    deviceName,
    // Kaydı bu oturuma bağla — çıkış/revoke/expiry sonrası dispatch temizler.
    sessionToken: session.session?.token ?? null,
  })

  return jsonSuccess({ registered: true })
}

export async function DELETE(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session?.user?.id) return jsonError("Unauthorized", 401)

  const body = (await request.json().catch(() => null)) as { token?: string } | null
  if (body?.token) {
    // Sahiplik-korumalı: yalnız kendi kaydını silebilir (başkasının token'ını
    // öğrenen bir kullanıcı onun aboneliğini öldüremesin).
    await pushSubscriptionModel.deleteByEndpointForUser(body.token.trim(), session.user.id)
  }
  return jsonSuccess({ registered: false })
}
