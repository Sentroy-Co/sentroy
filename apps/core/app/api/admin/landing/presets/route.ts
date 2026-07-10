import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertAdmin } from "@workspace/console/lib/admin-access"
import { landingPresetModel } from "@workspace/db/models"

export async function GET(request: NextRequest) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error

  const includeAuto = request.nextUrl.searchParams.get("include_auto") === "1"
  const items = await landingPresetModel.list({ includeAutoBackups: includeAuto })
  return jsonSuccess(items)
}

export async function POST(request: NextRequest) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error

  let body: { name?: string; description?: string | null }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    return jsonError("name is required")
  }

  const created = await landingPresetModel.createFromCurrent({
    name: body.name,
    description: body.description ?? null,
    isAutoBackup: false,
  })

  return jsonSuccess(created, 201)
}
