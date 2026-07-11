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

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const updates: Record<string, unknown> = {}

  if (typeof body.isActive === "boolean") {
    updates.isActive = body.isActive
  }

  if (typeof body.maxUses === "number") {
    updates.maxUses = body.maxUses
  }

  if (body.validUntil) {
    updates.validUntil = new Date(body.validUntil as string)
  }

  if (typeof body.discountPercent === "number") {
    updates.discountPercent = body.discountPercent
  }

  if (Array.isArray(body.applicablePlanIds)) {
    updates.applicablePlanIds = body.applicablePlanIds
  }

  if (Object.keys(updates).length === 0) {
    return jsonError("No valid fields to update")
  }

  updates.updatedAt = new Date()

  const db = await getDb()
  const result = await db.collection("coupons").findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: updates },
    { returnDocument: "after" },
  )

  if (!result) {
    return jsonError("Coupon not found", 404)
  }

  const { _id, ...rest } = result
  return jsonSuccess({ id: _id.toString(), ...rest })
}

export async function DELETE(
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
  const db = await getDb()

  const result = await db.collection("coupons").findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { isActive: false, updatedAt: new Date() } },
    { returnDocument: "after" },
  )

  if (!result) {
    return jsonError("Coupon not found", 404)
  }

  const { _id, ...rest } = result
  return jsonSuccess({ id: _id.toString(), ...rest })
}
