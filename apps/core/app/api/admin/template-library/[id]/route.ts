import { NextRequest } from "next/server"
import {
  jsonError,
  jsonSuccess,
  getAuthSession,
} from "@workspace/console/lib/api-helpers"
import { systemEmailTemplateModel } from "@workspace/db/models"
import { TEMPLATE_CATEGORIES } from "@workspace/db/models/system-email-template"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  const { id } = await params
  const item = await systemEmailTemplateModel.findById(id)
  if (!item) return jsonError("Not found", 404)
  return jsonSuccess(item)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  const { id } = await params
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const patch: Record<string, unknown> = {}
  if (typeof body.key === "string") patch.key = body.key.trim()
  for (const f of ["name", "description", "subject", "htmlBody"] as const) {
    if (body[f] && typeof body[f] === "object") patch[f] = body[f]
  }
  if (
    typeof body.category === "string" &&
    TEMPLATE_CATEGORIES.includes(body.category as never)
  ) {
    patch.category = body.category
  }
  if (Array.isArray(body.variables)) patch.variables = body.variables
  if (body.thumbnailUrl === null || typeof body.thumbnailUrl === "string") {
    patch.thumbnailUrl = body.thumbnailUrl
  }
  if (typeof body.isPublic === "boolean") patch.isPublic = body.isPublic
  if (typeof body.order === "number") patch.order = body.order
  if (body.collectionId === null || typeof body.collectionId === "string") {
    patch.collectionId = body.collectionId || null
  }

  if (Object.keys(patch).length === 0) return jsonError("Nothing to update")

  const updated = await systemEmailTemplateModel.updateById(id, patch)
  if (!updated) return jsonError("Not found", 404)
  return jsonSuccess(updated)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  const { id } = await params
  const ok = await systemEmailTemplateModel.deleteById(id)
  if (!ok) return jsonError("Not found", 404)
  return jsonSuccess({ message: "Deleted" })
}
