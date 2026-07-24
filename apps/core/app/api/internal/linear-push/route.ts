export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { verifyInternalRequest } from "@workspace/console/lib/internal-auth"
import { mailPushEventModel } from "@workspace/db/models"
import { dispatchToUsers } from "@/lib/push"

/**
 * Server-to-server push fan-out for Linear (Sentroy Tasks) notifications.
 * `dispatchToUsers` (web VAPID + APNs + FCM) lives in the core app, so the
 * linear app POSTs here (x-internal-secret) to reach a user's mobile/desktop
 * devices. Mirrors the mail/storage push path. Also writes a `mail_push_events`
 * row per user for the Electron desktop poll bridge.
 */
export async function POST(request: NextRequest) {
  const authErr = verifyInternalRequest(request)
  if (authErr) return authErr

  let body: {
    userIds?: unknown
    title?: unknown
    body?: unknown
    url?: unknown
    tag?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const userIds = Array.isArray(body.userIds)
    ? [...new Set(body.userIds.filter((v): v is string => typeof v === "string" && v.length > 0))]
    : []
  const title = typeof body.title === "string" ? body.title : ""
  const bodyText = typeof body.body === "string" ? body.body : ""
  const url = typeof body.url === "string" ? body.url : ""
  const tag = typeof body.tag === "string" && body.tag ? body.tag : "linear"

  if (userIds.length === 0 || !title) {
    return jsonError("userIds, title required")
  }

  let sent = 0
  try {
    sent = await dispatchToUsers(userIds, { title, body: bodyText, url, tag })
  } catch {
    /* push best-effort */
  }
  // Electron desktop poll bridge.
  await Promise.all(
    userIds.map((userId) =>
      mailPushEventModel
        .create({ userId, from: title, subject: bodyText, url, mailbox: tag })
        .catch(() => {}),
    ),
  )

  return jsonSuccess({ sent })
}
