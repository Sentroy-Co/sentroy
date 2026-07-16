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
  } | null

  const token = body?.token?.trim()
  const platform = body?.platform
  // APNs: 16-200 hex. FCM: uzun opaque token (harf/rakam/-/_/:), 100-400 char.
  const validApns = platform === "apns" && !!token && /^[0-9a-fA-F]{16,200}$/.test(token)
  const validFcm = platform === "fcm" && !!token && /^[A-Za-z0-9_:.-]{100,400}$/.test(token)
  if (!token || (!validApns && !validFcm)) {
    return jsonError("Invalid device registration", 400)
  }

  await pushSubscriptionModel.upsertDevice({
    userId: session.user.id,
    deviceToken: token,
    platform: platform as "apns" | "fcm",
    userAgent: request.headers.get("user-agent"),
  })

  return jsonSuccess({ registered: true })
}

export async function DELETE(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session?.user?.id) return jsonError("Unauthorized", 401)

  const body = (await request.json().catch(() => null)) as { token?: string } | null
  if (body?.token) {
    await pushSubscriptionModel.deleteByEndpoint(body.token.trim())
  }
  return jsonSuccess({ registered: false })
}
