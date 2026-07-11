export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getDb } from "@workspace/db/client"

export async function GET(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)

  const user = session.user as { role?: string }
  if (user.role !== "admin") return jsonError("Forbidden", 403)

  const db = await getDb()
  const pages = await db
    .collection("static_pages")
    .find()
    .sort({ order: 1, createdAt: -1 })
    .toArray()

  return jsonSuccess(
    pages.map((p) => ({
      id: p._id.toString(),
      title: p.title,
      slug: p.slug,
      content: p.content,
      published: p.published,
      order: p.order ?? 0,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
  )
}
