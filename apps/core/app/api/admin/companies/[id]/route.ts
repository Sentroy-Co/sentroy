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

  const allowedFields = [
    "maxMembers",
    "maxMailboxes",
    "maxDomains",
    "mailStorageLimit",
    "maxContacts",
    "trashRetentionDays",
    "monthlyEmailLimit",
  ]

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
  const result = await db.collection("companies").findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: updates },
    { returnDocument: "after" },
  )

  if (!result) {
    return jsonError("Company not found", 404)
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

  const company = await db.collection("companies").findOne({ _id: new ObjectId(id) })
  if (!company) {
    return jsonError("Company not found", 404)
  }

  await db.collection("company_members").deleteMany({ companyId: id })
  await db.collection("companies").deleteOne({ _id: new ObjectId(id) })

  return jsonSuccess({ deleted: true })
}
