export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertAdmin } from "@workspace/console/lib/admin-access"
import { landingTestimonialModel } from "@workspace/db/models"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error

  const { id } = await params

  let body: {
    quote?: Record<string, string>
    name?: string
    title?: Record<string, string>
    photoUrl?: string | null
    rating?: number | null
    order?: number
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const patch: Record<string, unknown> = {}
  if (body.quote && typeof body.quote === "object") patch.quote = body.quote
  if (typeof body.name === "string") patch.name = body.name.trim()
  if (body.title && typeof body.title === "object") patch.title = body.title
  if (body.photoUrl !== undefined) patch.photoUrl = body.photoUrl?.toString().trim() || null
  if (body.rating !== undefined) patch.rating = body.rating
  if (typeof body.order === "number") patch.order = body.order

  if (Object.keys(patch).length === 0) return jsonError("Nothing to update")

  const item = await landingTestimonialModel.updateById(id, patch)
  if (!item) return jsonError("Testimonial not found", 404)

  return jsonSuccess(item)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error

  const { id } = await params
  const deleted = await landingTestimonialModel.deleteById(id)
  if (!deleted) return jsonError("Testimonial not found", 404)

  return jsonSuccess({ message: "Testimonial deleted" })
}
