import { NextRequest } from "next/server"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { pushSubscriptionModel } from "@workspace/db/models"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Mobile (APNs) device-token registration — user-scoped, session (cookie) auth.
 * The Flutter mail app registers its APNs hex token here after sign-in; the same
 * mail-server→core dispatch that fans out Web Push also pushes to these tokens
 * (see lib/push.dispatchToUsers). POST → opt-in, DELETE → opt-out (logout/toggle).
 *
 * Mirrors /api/push/subscribe (web) but for native tokens: the token lives in
 * the shared `push_subscriptions` collection with `platform: "apns"`.
 */
export async function POST(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session?.user?.id) return jsonError("Unauthorized", 401)

  const body = (await request.json().catch(() => null)) as {
    platform?: string
    token?: string
  } | null

  const token = body?.token?.trim()
  // Only APNs today; the field is explicit so an FCM platform can slot in later.
  if (body?.platform !== "apns" || !token || !/^[0-9a-fA-F]{16,200}$/.test(token)) {
    return jsonError("Invalid device registration", 400)
  }

  await pushSubscriptionModel.upsertDevice({
    userId: session.user.id,
    deviceToken: token,
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
