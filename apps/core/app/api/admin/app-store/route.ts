import { NextRequest } from "next/server"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getDb } from "@workspace/db/client"

/**
 * Admin — App Store onay kuyruğu. `?status=pending|approved|rejected|suspended`
 * (default pending). Yalnız system admin.
 */
export async function GET(req: NextRequest) {
  const session = await getAuthSession(req)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status") ?? "pending"
  const valid = ["pending", "approved", "rejected", "suspended"]
  const filter: Record<string, unknown> = valid.includes(status) ? { status } : {}

  const db = await getDb()
  const docs = await db.collection("sentroy_apps").find(filter).sort({ createdAt: 1 }).toArray()

  const apps = docs.map((d) => ({
    id: d._id.toString(),
    appId: d.appId,
    slug: d.slug,
    name: d.name,
    tagline: d.tagline ?? null,
    status: d.status,
    source: d.source,
    visibility: d.visibility,
    developerCompanyId: d.developerCompanyId,
    currentVersion: d.currentVersion,
    embedUrl: d.embedUrl,
    embedOrigin: d.embedOrigin,
    authMode: d.authMode,
    pricing: d.pricing,
    appearance: d.appearance,
    store: d.store,
    originVerifiedAt: d.originVerifiedAt ?? null,
    verificationToken: d.verificationToken,
    rejectionReason: d.rejectionReason ?? null,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  }))

  return jsonSuccess({ apps })
}
