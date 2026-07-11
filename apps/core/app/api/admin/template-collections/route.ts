export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import {
  jsonError,
  jsonSuccess,
  getAuthSession,
} from "@workspace/console/lib/api-helpers"
import { systemTemplateCollectionModel } from "@workspace/db/models"

export async function GET(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  const items = await systemTemplateCollectionModel.list()
  return jsonSuccess(items)
}

export async function POST(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (!body.key || typeof body.key !== "string") return jsonError("key is required")
  if (!body.name || typeof body.name !== "object") return jsonError("name is required")

  const created = await systemTemplateCollectionModel.create({
    key: body.key as string,
    name: body.name as Record<string, string>,
    description: (body.description as Record<string, string>) ?? {},
    coverUrl: typeof body.coverUrl === "string" ? body.coverUrl : null,
    isPublic: typeof body.isPublic === "boolean" ? body.isPublic : true,
    order: typeof body.order === "number" ? body.order : 0,
  })

  return jsonSuccess(created, 201)
}
