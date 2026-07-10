import { NextRequest } from "next/server"
import {
  getAuthSession,
  jsonError,
  jsonSuccess,
} from "@workspace/console/lib/api-helpers"
import { userNotificationModel } from "@workspace/db/models"

/**
 * Persisted in-app notifications — kullanıcı her cihazdan aynı listeyi görür.
 * Live SSE event'leri (mail-delivered) ayrı kanal; bunlar invitation-style
 * sistem bildirimleri.
 *
 * GET     /api/user/notifications              → list (latest 50)
 * POST    /api/user/notifications/[id]/read    → mark single read
 * POST    /api/user/notifications/read-all     → mark all read
 * DELETE  /api/user/notifications/[id]         → delete
 */

export async function listHandler(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  const items = await userNotificationModel.listForUser(session.user.id, {
    limit: 50,
  })
  return jsonSuccess(items)
}

export async function markReadHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  const { id } = await params
  await userNotificationModel.markRead(session.user.id, id)
  return jsonSuccess({ ok: true })
}

export async function markAllReadHandler(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  const updated = await userNotificationModel.markAllRead(session.user.id)
  return jsonSuccess({ updated })
}

export async function deleteHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  const { id } = await params
  await userNotificationModel.deleteById(session.user.id, id)
  return jsonSuccess({ ok: true })
}
