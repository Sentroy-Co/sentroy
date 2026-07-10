import { NextRequest } from "next/server"
import {
  jsonError,
  jsonSuccess,
  getAuthSession,
} from "@workspace/console/lib/api-helpers"
import { systemMailSettingsModel } from "@workspace/db/models"

export async function GET(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  const settings = await systemMailSettingsModel.get()
  return jsonSuccess(settings)
}

export async function PATCH(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  let body: { systemMailDomainId?: string | null; fromAddress?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const patch: Partial<{
    systemMailDomainId: string | null
    fromAddress: string
  }> = {}
  if (body.systemMailDomainId !== undefined) {
    patch.systemMailDomainId = body.systemMailDomainId
  }
  if (typeof body.fromAddress === "string" && body.fromAddress.trim()) {
    patch.fromAddress = body.fromAddress.trim()
  }
  if (Object.keys(patch).length === 0) return jsonError("Nothing to update")

  const updated = await systemMailSettingsModel.update(patch)
  return jsonSuccess(updated)
}
