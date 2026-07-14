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

  await pushSubscriptionModel.upsertByEndpoint({
    userId: session.user.id,
    endpoint,
    p256dh,
    auth,
    userAgent: request.headers.get("user-agent"),
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
    await pushSubscriptionModel.deleteByEndpoint(body.endpoint)
  }
  return jsonSuccess({ subscribed: false })
}
