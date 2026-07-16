import { NextRequest } from "next/server"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { pushSubscriptionModel } from "@workspace/db/models"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * PATCH /api/push/devices/[id] { enabled } — cihaz-bazlı bildirim aç/kapa
 * (uzaktan yönetim: telefondan tarayıcı aboneliğini sessize alma vb.).
 * DELETE — cihaz kaydını kaldır. İkisi de sahiplik-korumalı (yalnız kendi
 * kaydı; model userId filtresiyle sorgular).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession(request)
  if (!session?.user?.id) return jsonError("Unauthorized", 401)
  const { id } = await params

  const body = (await request.json().catch(() => null)) as { enabled?: boolean } | null
  if (typeof body?.enabled !== "boolean") {
    return jsonError("Invalid body — { enabled: boolean } required", 400)
  }

  const ok = await pushSubscriptionModel.setEnabledForUser(session.user.id, id, body.enabled)
  if (!ok) return jsonError("Device not found", 404)
  return jsonSuccess({ id, enabled: body.enabled })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession(request)
  if (!session?.user?.id) return jsonError("Unauthorized", 401)
  const { id } = await params

  const ok = await pushSubscriptionModel.deleteByIdForUser(session.user.id, id)
  if (!ok) return jsonError("Device not found", 404)
  return jsonSuccess({ id, deleted: true })
}
