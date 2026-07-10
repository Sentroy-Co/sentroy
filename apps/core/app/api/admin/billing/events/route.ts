import { NextRequest } from "next/server"
import { ObjectId } from "mongodb"
import {
  getAuthSession,
  jsonError,
  jsonSuccess,
} from "@workspace/console/lib/api-helpers"
import { getDb } from "@workspace/db/client"
import { polarEventModel } from "@workspace/db/models"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET — son Polar webhook olayları (kim ne zaman ne yaptı; iptal/ödeme). */
export async function GET(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  const events = await polarEventModel.listRecent(60)

  // companyId → şirket adı lookup
  const companyIds = [
    ...new Set(events.map((e) => e.companyId).filter(Boolean) as string[]),
  ]
  const companyObjectIds = companyIds.flatMap((id) => {
    try {
      return [new ObjectId(id)]
    } catch {
      return []
    }
  })
  const db = await getDb()
  const companies = companyObjectIds.length
    ? await db
        .collection("companies")
        .find({ _id: { $in: companyObjectIds } })
        .project({ name: 1 })
        .toArray()
    : []
  const nameMap = new Map<string, string>()
  for (const c of companies) nameMap.set(c._id.toString(), c.name as string)

  const items = events.map((e) => ({
    id: e.id,
    type: e.type,
    environment: e.environment,
    companyId: e.companyId,
    companyName: e.companyId ? (nameMap.get(e.companyId) ?? null) : null,
    processed: !!e.processedAt,
    error: e.error,
    createdAt: e.createdAt,
  }))

  return jsonSuccess(items)
}
