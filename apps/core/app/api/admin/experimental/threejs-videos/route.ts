export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertAdmin } from "@workspace/console/lib/admin-access"
import { threejsSceneModel } from "@workspace/db/models"

export async function GET(request: NextRequest) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error
  const items = await threejsSceneModel.list()
  return jsonSuccess(items)
}

export async function POST(request: NextRequest) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error

  let body: {
    name?: string
    description?: string | null
    config?: import("@workspace/db/models/threejs-scene").ThreejsSceneConfig
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }
  if (!body.name?.trim()) return jsonError("name is required")
  if (!body.config) return jsonError("config is required")

  const created = await threejsSceneModel.insert({
    name: body.name.trim(),
    description: body.description ?? null,
    config: body.config,
    createdBy: access.session?.user?.id ?? "system",
  })
  return jsonSuccess(created, 201)
}
