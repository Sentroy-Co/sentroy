import { NextRequest } from "next/server"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getDb } from "@workspace/db/client"

// GET /api/pages — Public: tüm yayınlanmış sayfaları listele
export async function GET() {
  const db = await getDb()
  const pages = await db
    .collection("static_pages")
    .find({ published: true })
    .sort({ order: 1 })
    .project({ slug: 1, title: 1, _id: 0 })
    .toArray()

  return jsonSuccess(pages)
}

// POST /api/pages — Admin: yeni sayfa oluştur
// title ve content: Record<string, string> (multilang) veya string (eski format)
export async function POST(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)

  const user = session.user as { role?: string }
  if (user.role !== "admin") return jsonError("Forbidden", 403)

  let body: {
    title?: Record<string, string> | string
    slug?: string
    content?: Record<string, string> | string
    published?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (!body.title || !body.slug || !body.content) {
    return jsonError("title, slug, and content are required")
  }

  const slug = body.slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")

  const db = await getDb()

  const existing = await db.collection("static_pages").findOne({ slug })
  if (existing) return jsonError("A page with this slug already exists", 409)

  const page = {
    title: body.title,
    slug,
    content: body.content,
    published: body.published ?? true,
    order: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const result = await db.collection("static_pages").insertOne(page)

  return jsonSuccess({ id: result.insertedId.toString(), ...page }, 201)
}
