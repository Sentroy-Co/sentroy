import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertAdmin } from "@workspace/console/lib/admin-access"
import { landingAppModel } from "@workspace/db/models"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error

  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const patch: Record<string, unknown> = {}
  const stringFields = ["key", "iconKey", "ctaUrl"] as const
  for (const f of stringFields) {
    if (typeof body[f] === "string") patch[f] = (body[f] as string).trim()
  }
  const localizedFields = ["name", "tagline", "description", "ctaLabel"] as const
  for (const f of localizedFields) {
    if (body[f] && typeof body[f] === "object") patch[f] = body[f]
  }
  if (Array.isArray(body.features)) patch.features = body.features
  if (body.sdkExampleKey === null || typeof body.sdkExampleKey === "string") {
    patch.sdkExampleKey = body.sdkExampleKey
  }
  if (typeof body.order === "number") patch.order = body.order
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled

  if (Object.keys(patch).length === 0) return jsonError("Nothing to update")

  const item = await landingAppModel.updateById(id, patch)
  if (!item) return jsonError("App not found", 404)

  return jsonSuccess(item)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error

  const { id } = await params
  const deleted = await landingAppModel.deleteById(id)
  if (!deleted) return jsonError("App not found", 404)

  return jsonSuccess({ message: "App deleted" })
}
