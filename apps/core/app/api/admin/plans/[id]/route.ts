import { NextRequest } from "next/server"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getDb } from "@workspace/db/client"
import { ObjectId } from "mongodb"
import { sanitizeFeatures, sanitizePolar } from "../route"

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

  const allowedFields = [
    "name",
    "description",
    "maxCompanies",
    "maxDomainsPerCompany",
    "maxMembersPerCompany",
    "maxMailboxesPerCompany",
    "maxContacts",
    "storageLimit",
    "trashRetentionDays",
    "monthlyEmailLimit",
    "maxWhatsappNumbers",
    "maxWhatsappTemplates",
    "monthlyWhatsappLimit",
    "features",
    "price",
    "yearlyPrice",
    "polar",
    "isDefault",
    "isActive",
  ]

  const updates: Record<string, unknown> = {}

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field]
    }
  }

  // Çok dilli / yapısal alanları normalize et.
  if (updates.features !== undefined) {
    updates.features = sanitizeFeatures(updates.features)
  }
  if (updates.polar !== undefined) {
    updates.polar = sanitizePolar(updates.polar)
  }

  if (Object.keys(updates).length === 0) {
    return jsonError("No valid fields to update")
  }

  updates.updatedAt = new Date()

  const db = await getDb()
  const result = await db.collection("plans").findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: updates },
    { returnDocument: "after" },
  )

  if (!result) {
    return jsonError("Plan not found", 404)
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

  const result = await db.collection("plans").findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { isActive: false, updatedAt: new Date() } },
    { returnDocument: "after" },
  )

  if (!result) {
    return jsonError("Plan not found", 404)
  }

  const { _id, ...rest } = result
  return jsonSuccess({ id: _id.toString(), ...rest })
}
