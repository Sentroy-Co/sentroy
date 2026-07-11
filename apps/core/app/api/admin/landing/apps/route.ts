export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertAdmin } from "@workspace/console/lib/admin-access"
import { landingAppModel } from "@workspace/db/models"

export async function GET(request: NextRequest) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error

  const items = await landingAppModel.list()
  return jsonSuccess(items)
}

export async function POST(request: NextRequest) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error

  let body: {
    key?: string
    name?: Record<string, string>
    tagline?: Record<string, string>
    description?: Record<string, string>
    iconKey?: string
    features?: Record<string, string>[]
    ctaUrl?: string
    ctaLabel?: Record<string, string>
    sdkExampleKey?: string | null
    order?: number
    enabled?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (!body.key || typeof body.key !== "string") return jsonError("key is required")
  if (!body.name || typeof body.name !== "object") return jsonError("name is required")
  if (!body.tagline || typeof body.tagline !== "object") return jsonError("tagline is required")
  if (!body.description || typeof body.description !== "object") return jsonError("description is required")
  if (!body.iconKey || typeof body.iconKey !== "string") return jsonError("iconKey is required")
  if (!body.ctaUrl || typeof body.ctaUrl !== "string") return jsonError("ctaUrl is required")
  if (!body.ctaLabel || typeof body.ctaLabel !== "object") return jsonError("ctaLabel is required")

  const created = await landingAppModel.create({
    key: body.key.trim(),
    name: body.name,
    tagline: body.tagline,
    description: body.description,
    iconKey: body.iconKey.trim(),
    features: Array.isArray(body.features) ? body.features : [],
    ctaUrl: body.ctaUrl.trim(),
    ctaLabel: body.ctaLabel,
    sdkExampleKey: body.sdkExampleKey ?? null,
    order: typeof body.order === "number" ? body.order : 0,
    enabled: typeof body.enabled === "boolean" ? body.enabled : true,
  })

  return jsonSuccess(created, 201)
}
