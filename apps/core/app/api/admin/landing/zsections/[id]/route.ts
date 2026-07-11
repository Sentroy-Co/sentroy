export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertAdmin } from "@workspace/console/lib/admin-access"
import { landingZSectionModel } from "@workspace/db/models"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error

  const { id } = await params

  let body: {
    title?: Record<string, string>
    problem?: Record<string, string>
    solution?: Record<string, string>
    result?: Record<string, string>
    visual?: string | null
    order?: number
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const patch: Record<string, unknown> = {}
  if (body.title && typeof body.title === "object") patch.title = body.title
  if (body.problem && typeof body.problem === "object") patch.problem = body.problem
  if (body.solution && typeof body.solution === "object") patch.solution = body.solution
  if (body.result && typeof body.result === "object") patch.result = body.result
  if (body.visual !== undefined) patch.visual = body.visual?.toString().trim() || null
  if (typeof body.order === "number") patch.order = body.order

  if (Object.keys(patch).length === 0) return jsonError("Nothing to update")

  const item = await landingZSectionModel.updateById(id, patch)
  if (!item) return jsonError("Z-section not found", 404)

  return jsonSuccess(item)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error

  const { id } = await params
  const deleted = await landingZSectionModel.deleteById(id)
  if (!deleted) return jsonError("Z-section not found", 404)

  return jsonSuccess({ message: "Z-section deleted" })
}
