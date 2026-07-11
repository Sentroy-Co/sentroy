export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import {
  jsonError,
  jsonSuccess,
  getAuthSession,
} from "@workspace/console/lib/api-helpers"
import { systemEmailTemplateModel } from "@workspace/db/models"
import { TEMPLATE_CATEGORIES } from "@workspace/db/models/system-email-template"

export async function GET(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  const items = await systemEmailTemplateModel.list()
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
  if (!body.subject || typeof body.subject !== "object") return jsonError("subject is required")
  if (!body.htmlBody || typeof body.htmlBody !== "object") return jsonError("htmlBody is required")
  if (!body.category || !TEMPLATE_CATEGORIES.includes(body.category as never)) {
    return jsonError("invalid category")
  }

  const created = await systemEmailTemplateModel.create({
    key: body.key as string,
    collectionId:
      typeof body.collectionId === "string" && body.collectionId
        ? body.collectionId
        : null,
    name: body.name as Record<string, string>,
    description: (body.description as Record<string, string>) ?? {},
    category: body.category as (typeof TEMPLATE_CATEGORIES)[number],
    subject: body.subject as Record<string, string>,
    htmlBody: body.htmlBody as Record<string, string>,
    variables: Array.isArray(body.variables) ? (body.variables as string[]) : [],
    thumbnailUrl: typeof body.thumbnailUrl === "string" ? body.thumbnailUrl : null,
    isPublic: typeof body.isPublic === "boolean" ? body.isPublic : true,
    order: typeof body.order === "number" ? body.order : 0,
  })

  return jsonSuccess(created, 201)
}
