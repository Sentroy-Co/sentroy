import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertAdmin } from "@workspace/console/lib/admin-access"
import { landingZSectionModel } from "@workspace/db/models"

export async function GET(request: NextRequest) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error

  const items = await landingZSectionModel.list()
  return jsonSuccess(items)
}

export async function POST(request: NextRequest) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error

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

  if (!body.title || typeof body.title !== "object") return jsonError("title is required")
  if (!body.problem || typeof body.problem !== "object") return jsonError("problem is required")
  if (!body.solution || typeof body.solution !== "object") return jsonError("solution is required")
  if (!body.result || typeof body.result !== "object") return jsonError("result is required")

  const created = await landingZSectionModel.create({
    title: body.title,
    problem: body.problem,
    solution: body.solution,
    result: body.result,
    visual: body.visual?.toString().trim() || null,
    order: typeof body.order === "number" ? body.order : 0,
  })

  return jsonSuccess(created, 201)
}
