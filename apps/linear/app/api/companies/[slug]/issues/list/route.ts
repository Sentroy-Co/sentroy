import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getLinearContext } from "@/lib/linear/context"
import { resolveRequester, type PanelUser } from "@/lib/linear/mapping"
import { listIssues, type ListIssuesScope } from "@/lib/linear/issues"
import { getUiFlagsForCompany } from "@/lib/settings"
import { LinearError } from "@/lib/errors"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /issues/list — panel (liste/kanban) için JSON issue listesi. Mobil
 * (Sentroy Tasks) tüketicisi. Web'de aynı veri yalnız RSC `page.tsx`'te
 * render ediliyordu; burada `listIssues` servis fonksiyonunu (panel-source +
 * scope/state/team/assignee/label filtreleri + cursor) JSON'a köprüler.
 *
 * linear.view. Query: scope(mine|workspace) · state(open|closed|all) ·
 * team · assignee(çoklu) · label(çoklu) · cursor · pageSize.
 * Metadata (statesByTeam/labelsByTeam/users/teams) AYRI: `GET /issues`.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await resolveCompanyAccess(request, slug, "linear.view")
  if ("error" in access) return access.error

  const ctx = await getLinearContext(access.companyId)
  if (!ctx) return jsonError("not_connected", 412)

  const sp = request.nextUrl.searchParams
  const stateParam = sp.get("state")
  const stateType: "open" | "closed" | "all" =
    stateParam === "open" || stateParam === "closed" ? stateParam : "all"
  const scope: ListIssuesScope = sp.get("scope") === "mine" ? "mine" : "workspace"
  const cursor = sp.get("cursor")?.trim() || null
  const teamId = sp.get("team")?.trim() || undefined
  const assigneeIds = sp.getAll("assignee").map((v) => v.trim()).filter(Boolean)
  const labelIds = sp.getAll("label").map((v) => v.trim()).filter(Boolean)
  const pageSizeRaw = Number(sp.get("pageSize"))
  const pageSize =
    Number.isFinite(pageSizeRaw) && pageSizeRaw > 0
      ? Math.min(Math.floor(pageSizeRaw), 100)
      : 50

  // Session modunda gerçek kullanıcı; token modunda caller'dan minimal kimlik
  // (email yoksa resolveRequester proxy döner — scope=workspace'te filtre boş).
  const u = access.session?.user
  const requesterInput: PanelUser = u
    ? { id: u.id, email: u.email, name: u.name, image: u.image }
    : {
        id: access.callerUserId,
        email: access.callerEmail ?? null,
        name: access.callerEmail ?? null,
        image: null,
      }

  try {
    const uiFlags = await getUiFlagsForCompany(access.companyId)
    const requester = await resolveRequester(ctx, requesterInput)
    const page = await listIssues(ctx, {
      requester,
      scope,
      cursor,
      stateType,
      pageSize,
      teamId,
      assigneeIds: assigneeIds.length ? assigneeIds : undefined,
      labelIds: labelIds.length ? labelIds : undefined,
      showAllIssues: uiFlags.showAllIssues,
    })
    return jsonSuccess({
      issues: page.nodes,
      hasNextPage: page.pageInfo.hasNextPage,
      cursor: page.pageInfo.endCursor,
      requester: requester.kind,
      filters: { scope, state: stateType, assigneeIds, labelIds, teamId: teamId ?? null },
    })
  } catch (err) {
    logger.error({
      source: "linear",
      route: "issues/list",
      companyId: access.companyId,
      message: (err as Error).message,
    })
    if (err instanceof LinearError) return jsonError(err.message, 502)
    return jsonError("Failed to load issues", 502)
  }
}
