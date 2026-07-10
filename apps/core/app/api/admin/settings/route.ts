import { NextRequest } from "next/server"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getDb } from "@workspace/db/client"

/**
 * Sistem ayarları. NOT: company create limitleri buradan GELMEZ — yeni
 * company default plan'ın (`plan.isDefault`) limitleriyle açılır
 * (apps/core/app/api/companies/route.ts → `planModel.findDefault()`).
 * Eski `defaultMax*` alanları hiçbir akışta okunmuyordu, kaldırıldı.
 */
const DEFAULT_SETTINGS = {
  /**
   * Storage tek dosya upload üst sınırı (byte). Storage app'in upload
   * endpoint'i bu değeri runtime'da okur; UI'da `useMaxUploadBytes()`
   * hook'u layout-fetched değerden alır. Default 50 MB.
   */
  maxUploadBytes: 52428800,
}

export async function GET(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) {
    return jsonError("Unauthorized", 401)
  }
  if (session.user.role !== "admin") {
    return jsonError("Forbidden", 403)
  }

  const db = await getDb()
  const doc = await db.collection("system_settings").findOne({ key: "global" })

  if (!doc) {
    return jsonSuccess(DEFAULT_SETTINGS)
  }

  const { _id, key, ...rest } = doc
  return jsonSuccess({ ...DEFAULT_SETTINGS, ...rest })
}

export async function PATCH(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) {
    return jsonError("Unauthorized", 401)
  }
  if (session.user.role !== "admin") {
    return jsonError("Forbidden", 403)
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const allowedFields = Object.keys(DEFAULT_SETTINGS)
  const updates: Record<string, unknown> = {}

  for (const field of allowedFields) {
    if (body[field] !== undefined && typeof body[field] === "number") {
      updates[field] = body[field]
    }
  }

  if (Object.keys(updates).length === 0) {
    return jsonError("No valid fields to update")
  }

  updates.updatedAt = new Date()

  const db = await getDb()
  await db.collection("system_settings").updateOne(
    { key: "global" },
    { $set: updates, $setOnInsert: { key: "global", createdAt: new Date() } },
    { upsert: true },
  )

  const doc = await db.collection("system_settings").findOne({ key: "global" })
  const { _id, ...rest } = doc ?? {}

  return jsonSuccess({ ...DEFAULT_SETTINGS, ...rest })
}
