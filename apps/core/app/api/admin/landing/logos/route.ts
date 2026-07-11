export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertAdmin } from "@workspace/console/lib/admin-access"
import { landingLogoModel } from "@workspace/db/models"

export async function GET(request: NextRequest) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error

  const logos = await landingLogoModel.list()
  return jsonSuccess(logos)
}

export async function POST(request: NextRequest) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error

  let body: { name?: string; imageUrl?: string; url?: string; order?: number }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (!body.name?.trim()) return jsonError("name is required")
  if (!body.imageUrl?.trim()) return jsonError("imageUrl is required")

  const logo = await landingLogoModel.create({
    name: body.name.trim(),
    imageUrl: body.imageUrl.trim(),
    url: body.url?.trim() || null,
    order: typeof body.order === "number" ? body.order : 0,
  })

  return jsonSuccess(logo, 201)
}
