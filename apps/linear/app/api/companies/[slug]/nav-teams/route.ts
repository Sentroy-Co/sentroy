import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getLinearContext } from "@/lib/linear/context"
import { linearGraphQL } from "@/lib/linear/client"
import { getTeams } from "@/lib/linear/metadata"
import { panelSourceFilter } from "@/lib/linear/issues"
import { getUiFlagsForCompany } from "@/lib/settings"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /nav-teams — sidebar takım navigasyonu verisi.
 *
 * `groupByTeam` uiFlag'i AÇIKKEN sidebar (hem linear'ın kendi sidebar'ı hem
 * OS AppSectionPanel'i) overview'ı grup başlığı yapıp takımları link olarak
 * listeler; rozet = takımın BACKLOG'ta bekleyen issue sayısı. Flag kapalıysa
 * hızlı `{groupByTeam:false}` döner (Linear API'ye hiç gidilmez).
 *
 * Sayım tek GraphQL çağrısıyla yapılır (yalnız team.id alanı, first:250) —
 * takım başına ayrı sorgu YOK. 250'den fazla backlog issue varsa sayımlar
 * alt sınırdır (`truncated:true`); rozet zaten 99+'ta kırpılır. Panel-kaynak
 * filtresi overview ile aynı semantiği izler: showAllIssues açıksa atlanır.
 */
const NAV_COUNT_QUERY = /* GraphQL */ `
  query NavBacklogCounts($filter: IssueFilter, $first: Int!) {
    issues(filter: $filter, first: $first) {
      nodes {
        team {
          id
        }
      }
      pageInfo {
        hasNextPage
      }
    }
  }
`

type NavCountResponse = {
  issues: {
    nodes: { team: { id: string } | null }[]
    pageInfo: { hasNextPage: boolean }
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await resolveCompanyAccess(request, slug, "linear.view")
  if ("error" in access) return access.error

  const uiFlags = await getUiFlagsForCompany(access.companyId)
  if (!uiFlags.groupByTeam) {
    return jsonSuccess({ groupByTeam: false, teams: [], truncated: false })
  }

  const ctx = await getLinearContext(access.companyId)
  if (!ctx) return jsonError("not_connected", 412)

  try {
    const backlogFilter = { state: { type: { eq: "backlog" } } }
    const panelFilter = uiFlags.showAllIssues ? null : panelSourceFilter(ctx)
    const filter = panelFilter ? { and: [backlogFilter, panelFilter] } : backlogFilter

    const [teams, counts] = await Promise.all([
      getTeams(ctx),
      linearGraphQL<NavCountResponse>(ctx, NAV_COUNT_QUERY, {
        filter,
        first: 250,
      }),
    ])

    const byTeam = new Map<string, number>()
    for (const node of counts.issues.nodes) {
      const id = node.team?.id
      if (!id) continue
      byTeam.set(id, (byTeam.get(id) ?? 0) + 1)
    }

    return jsonSuccess({
      groupByTeam: true,
      truncated: counts.issues.pageInfo.hasNextPage,
      teams: teams.map((t) => ({
        id: t.id,
        key: t.key,
        name: t.name,
        backlogCount: byTeam.get(t.id) ?? 0,
      })),
    })
  } catch (err) {
    logger.error({
      source: "linear",
      route: "nav-teams",
      companyId: access.companyId,
      message: (err as Error).message,
    })
    return jsonError("Failed to fetch team navigation", 502)
  }
}
