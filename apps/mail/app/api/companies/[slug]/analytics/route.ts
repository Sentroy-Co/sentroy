export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForCompany } from "@/lib/sentroy-proxy"

const ALLOWED_DAYS = new Set([7, 30, 90])

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  // Permission: logs.view kapsamında — analytics görünümü ham log dataset'inin
  // istatistik özetidir, ayrı scope kapısı koymak yerine logs.view yeterli.
  const result = await getSentroyForCompany(request, slug, "logs.view")
  if ("error" in result && result.error) return result.error

  const sentroy = result.sentroy!
  const url = request.nextUrl
  const rawDays = Number(url.searchParams.get("days") || "30")
  const days = ALLOWED_DAYS.has(rawDays) ? rawDays : 30
  const domainId = url.searchParams.get("domainId") || undefined

  const now = new Date()
  const from = new Date(now.getTime() - days * 86_400_000).toISOString()
  const prevFrom = new Date(now.getTime() - days * 2 * 86_400_000).toISOString()
  const prevTo = from

  try {
    const [overviewRes, prevOverviewRes, dailyRes, domainsRes, recentLogsRes] =
      await Promise.all([
        sentroy.statistics
          .overview({ from, to: now.toISOString(), domainId })
          .catch(() => ({ data: null })),
        sentroy.statistics
          .overview({ from: prevFrom, to: prevTo, domainId })
          .catch(() => ({ data: null })),
        sentroy.statistics
          .daily({ days, domainId })
          .catch(() => ({ data: [] })),
        sentroy.statistics.domains().catch(() => ({ data: [] })),
        sentroy.logs
          .list({ limit: 20, page: 1, domainId })
          .catch(() => ({ data: [] })),
      ])

    return jsonSuccess({
      windowDays: days,
      domainId: domainId ?? null,
      overview: overviewRes.data,
      prevOverview: prevOverviewRes.data,
      daily: dailyRes.data ?? [],
      domains: domainsRes.data ?? [],
      recentLogs: recentLogsRes.data ?? [],
    })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load analytics"
    return jsonError(message, 500)
  }
}
