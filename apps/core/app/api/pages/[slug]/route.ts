export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getDb } from "@workspace/db/client"
import { sanitizeHtmlValue } from "@workspace/console/lib/sanitize-html"

// GET /api/pages/:slug — Public: tek sayfa
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  const db = await getDb()
  const page = await db.collection("static_pages").findOne({ slug, published: true })

  if (!page) return jsonError("Page not found", 404)

  return jsonSuccess({
    id: page._id.toString(),
    title: page.title,
    slug: page.slug,
    content: page.content,
    updatedAt: page.updatedAt,
  })
}

// PATCH /api/pages/:slug — Admin: sayfa güncelle
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)

  const user = session.user as { role?: string }
  if (user.role !== "admin") return jsonError("Forbidden", 403)

  let body: {
    title?: Record<string, string> | string
    content?: Record<string, string> | string
    published?: boolean
    order?: number
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (body.title !== undefined) updates.title = body.title
  // Stored XSS guard: admin HTML içeriği public'e render edilir — kaydederken
  // sanitize et (<script>/on*/javascript:/iframe strip). Lokalize {tr,en} veya
  // düz string ikisini de ele alır.
  if (body.content !== undefined)
    updates.content = sanitizeHtmlValue(body.content)
  if (body.published !== undefined) updates.published = body.published
  if (body.order !== undefined) updates.order = body.order

  const db = await getDb()
  const result = await db
    .collection("static_pages")
    .findOneAndUpdate({ slug }, { $set: updates }, { returnDocument: "after" })

  if (!result) return jsonError("Page not found", 404)

  return jsonSuccess({
    id: result._id.toString(),
    title: result.title,
    slug: result.slug,
    content: result.content,
    published: result.published,
    order: result.order,
    updatedAt: result.updatedAt,
  })
}

// DELETE /api/pages/:slug — Admin: sayfa sil
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)

  const user = session.user as { role?: string }
  if (user.role !== "admin") return jsonError("Forbidden", 403)

  const db = await getDb()
  const result = await db.collection("static_pages").deleteOne({ slug })

  if (result.deletedCount === 0) return jsonError("Page not found", 404)

  return jsonSuccess({ message: "Page deleted" })
}
