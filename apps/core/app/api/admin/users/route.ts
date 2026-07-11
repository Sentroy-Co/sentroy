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

  const { searchParams } = new URL(request.url)
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)))
  const search = searchParams.get("search") ?? ""
  const role = searchParams.get("role") ?? ""
  const status = searchParams.get("status") ?? ""

  const db = await getDb()
  const filter: Record<string, unknown> = {}

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ]
  }

  if (role && (role === "user" || role === "admin")) {
    filter.role = role
  }

  if (status && (status === "active" || status === "suspended")) {
    filter.status = status
  }

  const total = await db.collection("user").countDocuments(filter)
  const skip = (page - 1) * limit

  const users = await db
    .collection("user")
    .find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .toArray()

  const mapped = users.map((u) => {
    const { _id, ...rest } = u
    return { id: _id.toString(), ...rest }
  })

  return jsonSuccess({
    users: mapped,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  })
}
