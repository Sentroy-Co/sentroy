import { NextRequest } from "next/server"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { dispatchToUsers } from "@/lib/push"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Self-targeted push test — session (cookie) auth, dispatches a test
 * notification ONLY to the caller's own registered devices (Web Push + APNs +
 * FCM). Lets a user verify the full native-push chain (device registration →
 * dispatchToUsers → APNs/FCM → device) in one tap from mobile settings, without
 * needing a real event or another user. Cannot target other users (uses
 * session.user.id). Returns { sent } = number of device subscriptions reached
 * (0 → no registered devices or provider creds missing).
 */
export async function POST(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session?.user?.id) return jsonError("Unauthorized", 401)

  const body = (await request.json().catch(() => null)) as {
    title?: string
    body?: string
  } | null

  const title =
    typeof body?.title === "string" && body.title.trim()
      ? body.title.trim().slice(0, 100)
      : "Sentroy"
  const text =
    typeof body?.body === "string" && body.body.trim()
      ? body.body.trim().slice(0, 200)
      : "Test notification — your device is set up correctly."

  let sent = 0
  try {
    sent = await dispatchToUsers([session.user.id], {
      title,
      body: text,
      url: "",
      tag: "test",
    })
  } catch {
    /* best-effort */
  }

  return jsonSuccess({ sent })
}
