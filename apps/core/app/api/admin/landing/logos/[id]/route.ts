import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertAdmin } from "@workspace/console/lib/admin-access"
import { landingLogoModel } from "@workspace/db/models"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error

  const { id } = await params

  let body: { name?: string; imageUrl?: string; url?: string | null; order?: number }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const patch: Record<string, unknown> = {}
  if (typeof body.name === "string") patch.name = body.name.trim()
  if (typeof body.imageUrl === "string") patch.imageUrl = body.imageUrl.trim()
  if (body.url !== undefined) patch.url = body.url?.toString().trim() || null
  if (typeof body.order === "number") patch.order = body.order

  if (Object.keys(patch).length === 0) return jsonError("Nothing to update")

  const logo = await landingLogoModel.updateById(id, patch)
  if (!logo) return jsonError("Logo not found", 404)

  return jsonSuccess(logo)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error

  const { id } = await params
  const deleted = await landingLogoModel.deleteById(id)
  if (!deleted) return jsonError("Logo not found", 404)

  return jsonSuccess({ message: "Logo deleted" })
}
