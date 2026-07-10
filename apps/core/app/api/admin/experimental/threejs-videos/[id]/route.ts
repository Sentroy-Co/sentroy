import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertAdmin } from "@workspace/console/lib/admin-access"
import { threejsSceneModel } from "@workspace/db/models"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error
  const { id } = await params
  const scene = await threejsSceneModel.findById(id)
  if (!scene) return jsonError("Not found", 404)
  return jsonSuccess(scene)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error
  const { id } = await params

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

  const patch: Parameters<typeof threejsSceneModel.update>[1] = {}
  if (body.name !== undefined) patch.name = body.name
  if (body.description !== undefined) patch.description = body.description
  if (body.config !== undefined) patch.config = body.config

  if (Object.keys(patch).length === 0) return jsonError("Nothing to update")

  const updated = await threejsSceneModel.update(id, patch)
  if (!updated) return jsonError("Not found", 404)
  return jsonSuccess(updated)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error
  const { id } = await params
  const ok = await threejsSceneModel.deleteById(id)
  if (!ok) return jsonError("Not found", 404)
  return jsonSuccess({ deleted: true })
}
