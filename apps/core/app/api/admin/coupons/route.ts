export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getDb } from "@workspace/db/client"

export async function GET(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) {
    return jsonError("Unauthorized", 401)
  }
  if (session.user.role !== "admin") {
    return jsonError("Forbidden", 403)
  }

  const db = await getDb()
  const coupons = await db
    .collection("coupons")
    .find({})
    .sort({ createdAt: -1 })
    .toArray()

  const mapped = coupons.map((c) => {
    const { _id, ...rest } = c
    return { id: _id.toString(), ...rest }
  })

  return jsonSuccess(mapped)
}

export async function POST(request: NextRequest) {
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

  if (!body.code || typeof body.code !== "string" || !body.code.trim()) {
    return jsonError("Coupon code is required")
  }

  if (typeof body.discountPercent !== "number" || body.discountPercent <= 0 || body.discountPercent > 100) {
    return jsonError("discountPercent must be between 1 and 100")
  }

  const db = await getDb()

  const existing = await db.collection("coupons").findOne({ code: body.code })
  if (existing) {
    return jsonError("A coupon with this code already exists")
  }

  const now = new Date()
  const coupon = {
    code: (body.code as string).trim().toUpperCase(),
    discountPercent: body.discountPercent,
    maxUses: typeof body.maxUses === "number" ? body.maxUses : 100,
    usedCount: 0,
    validUntil: body.validUntil ? new Date(body.validUntil as string) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    applicablePlanIds: Array.isArray(body.applicablePlanIds) ? body.applicablePlanIds : [],
    isActive: body.isActive !== false,
    createdAt: now,
    updatedAt: now,
  }

  const result = await db.collection("coupons").insertOne(coupon)

  return jsonSuccess(
    { id: result.insertedId.toString(), ...coupon },
    201,
  )
}
