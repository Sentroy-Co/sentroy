import { NextRequest } from "next/server"
import {
  getAuthSession,
  jsonError,
  jsonSuccess,
} from "@workspace/console/lib/api-helpers"
import { systemStatusProbeModel } from "@workspace/db/models"

/**
 * GET /api/admin/system-status/history/minutes?service=<key>&hour=<ISO>
 *
 * Saatlik pill drill-down — kullanıcı pill'e tıklayınca o saatin 60
 * dakikalık dağılımını döner. Pill grid'in altında inline render edilir.
 *
 * `hour` ISO 8601 timestamp; saat başına yuvarlanır server-side. `service`
 * report'taki herhangi bir probe key'i (mongodb, sentroy-api, cdn,
 * mail-app, storage-app).
 */
export async function GET(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  const sp = request.nextUrl.searchParams
  const service = sp.get("service")
  const hourParam = sp.get("hour")

  if (!service) return jsonError("service query param is required")
  if (!hourParam) return jsonError("hour query param is required")

  const hourStart = new Date(hourParam)
  if (Number.isNaN(hourStart.getTime())) {
    return jsonError("hour must be a valid ISO timestamp")
  }

  const buckets = await systemStatusProbeModel.aggregateMinutesForHour({
    serviceKey: service,
    hourStart,
  })
  return jsonSuccess({ service, hour: hourStart.toISOString(), buckets })
}
