export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import {
  jsonError,
  jsonSuccess,
  getAuthSession,
} from "@workspace/console/lib/api-helpers"
import {
  systemTemplateCollectionModel,
  systemEmailTemplateModel,
} from "@workspace/db/models"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  const { id } = await params
  const item = await systemTemplateCollectionModel.findById(id)
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
  for (const f of ["name", "description"] as const) {
    if (body[f] && typeof body[f] === "object") patch[f] = body[f]
  }
  if (body.coverUrl === null || typeof body.coverUrl === "string") {
    patch.coverUrl = body.coverUrl
  }
  if (typeof body.isPublic === "boolean") patch.isPublic = body.isPublic
  if (typeof body.order === "number") patch.order = body.order
  if (Object.keys(patch).length === 0) return jsonError("Nothing to update")

  const updated = await systemTemplateCollectionModel.updateById(id, patch)
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
  // Koleksiyona bağlı template'lerin collectionId'sini null'a çevir —
  // template'ler standalone'a düşer, silinmez.
  const templates = await systemEmailTemplateModel.list({ collectionId: id })
  await Promise.all(
    templates.map((tpl) =>
      systemEmailTemplateModel.updateById(tpl.id, { collectionId: null }),
    ),
  )

  const ok = await systemTemplateCollectionModel.deleteById(id)
  if (!ok) return jsonError("Not found", 404)
  return jsonSuccess({ message: "Deleted", detached: templates.length })
}
