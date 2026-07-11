export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess, getAuthSession } from "@workspace/console/lib/api-helpers"
import { systemStatusProbeModel } from "@workspace/db/models"

/**
 * GET /api/admin/system-status/history?hours=24
 *
 * Atlassian-style pill grid için saatlik aggregate. Her servis için son
 * `hours` saatin worst-status değeri + probe count'u döndürür. Probe
 * yapılmamış saatler "no-data" rengiyle pill görünür (gri).
 */
export async function GET(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  const hoursParam = Number(request.nextUrl.searchParams.get("hours") || "24")
  const hours = Math.max(1, Math.min(hoursParam, 168)) // 1h .. 7d

  const buckets = await systemStatusProbeModel.aggregateHistory({ hours })
  return jsonSuccess({ hours, services: buckets })
}
