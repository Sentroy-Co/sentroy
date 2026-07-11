export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertAdmin } from "@workspace/console/lib/admin-access"
import { landingPresetModel } from "@workspace/db/models"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error

  const { id } = await params
  const preset = await landingPresetModel.findById(id)
  if (!preset) return jsonError("Preset not found", 404)
  return jsonSuccess(preset)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error

  const { id } = await params
  const deleted = await landingPresetModel.deleteById(id)
  if (!deleted) return jsonError("Preset not found", 404)
  return jsonSuccess({ message: "Preset deleted" })
}
