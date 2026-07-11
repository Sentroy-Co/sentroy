export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertAdmin } from "@workspace/console/lib/admin-access"
import { landingTestimonialModel } from "@workspace/db/models"

export async function GET(request: NextRequest) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error

  const items = await landingTestimonialModel.list()
  return jsonSuccess(items)
}

export async function POST(request: NextRequest) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error

  let body: {
    quote?: Record<string, string>
    name?: string
    title?: Record<string, string>
    photoUrl?: string
    rating?: number
    order?: number
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (!body.quote || typeof body.quote !== "object") return jsonError("quote is required")
  if (!body.name?.trim()) return jsonError("name is required")
  if (!body.title || typeof body.title !== "object") return jsonError("title is required")

  const created = await landingTestimonialModel.create({
    quote: body.quote,
    name: body.name.trim(),
    title: body.title,
    photoUrl: body.photoUrl?.trim() || null,
    rating: typeof body.rating === "number" ? body.rating : null,
    order: typeof body.order === "number" ? body.order : 0,
  })

  return jsonSuccess(created, 201)
}
