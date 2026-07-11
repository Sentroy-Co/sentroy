export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import {
  jsonError,
  jsonSuccess,
  getAuthSession,
} from "@workspace/console/lib/api-helpers"
import { systemMailSettingsModel } from "@workspace/db/models"
import { getSystemSentroyClient } from "@/lib/system-mail"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  const { id } = await params
  const sentroy = await getSystemSentroyClient(session.user.id)
  const res = await sentroy.domains.get(id)
  return jsonSuccess(res.data)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  const { id } = await params
  const sentroy = await getSystemSentroyClient(session.user.id)
  await sentroy.domains.delete(id)

  // Silinen domain "active system mail domain" ise işaretlemeyi temizle.
  const settings = await systemMailSettingsModel.get()
  if (settings.systemMailDomainId === id) {
    await systemMailSettingsModel.update({ systemMailDomainId: null })
  }

  return jsonSuccess({ message: "Deleted" })
}
