export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getDb } from "@workspace/db/client"
import { ObjectId } from "mongodb"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession(request)
  if (!session) {
    return jsonError("Unauthorized", 401)
  }
  if (session.user.role !== "admin") {
    return jsonError("Forbidden", 403)
  }

  const { id } = await params

  let body: { role?: string; status?: string; planId?: string; name?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const updates: Record<string, unknown> = {}

  if (typeof body.name === "string") {
    const trimmed = body.name.trim()
    if (trimmed.length > 0 && trimmed.length <= 120) {
      updates.name = trimmed
    }
  }

  if (body.role && (body.role === "user" || body.role === "admin")) {
    updates.role = body.role
  }

  if (body.status && (body.status === "active" || body.status === "suspended")) {
    updates.status = body.status
  }

  if (body.planId !== undefined) {
    updates.planId = body.planId || null
  }

  if (Object.keys(updates).length === 0) {
    return jsonError("No valid fields to update")
  }

  updates.updatedAt = new Date()

  const db = await getDb()
  const result = await db.collection("user").findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: updates },
    { returnDocument: "after" },
  )

  if (!result) {
    return jsonError("User not found", 404)
  }

  const { _id, ...rest } = result
  return jsonSuccess({ id: _id.toString(), ...rest })
}
