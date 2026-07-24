import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { linearInboxSeenModel } from "@workspace/db/models"
import { getLinearContext } from "@/lib/linear/context"
import { resolveRequester, type PanelUser } from "@/lib/linear/mapping"
import { listInboxIssues } from "@/lib/linear/issues"
import { LinearError } from "@/lib/errors"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /inbox — kullanıcının KENDİ panelden gönderdiği talepleri (requests)
 * JSON döndürür. Web'de yalnız RSC `requests/page.tsx`'te render ediliyordu.
 * `listInboxIssues` (owner + panel-source filtresi) köprüsü + `markSeen`
 * (unread rozeti sıfırlama, fail-bypass). linear.view.
 * Query: cursor · pageSize (varsayılan 50).
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
  const cursor = sp.get("cursor")?.trim() || null
  const pageSizeRaw = Number(sp.get("pageSize"))
  const pageSize =
    Number.isFinite(pageSizeRaw) && pageSizeRaw > 0
      ? Math.min(Math.floor(pageSizeRaw), 100)
      : 50

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
    const requester = await resolveRequester(ctx, requesterInput)
    const page = await listInboxIssues(ctx, { requester, pageSize, cursor })
    // Inbox görüldü → unread rozetini sıfırla (fail-bypass).
    void linearInboxSeenModel.markSeen(access.companyId, access.callerUserId).catch(() => {})
    return jsonSuccess({
      issues: page.nodes,
      hasNextPage: page.pageInfo.hasNextPage,
      cursor: page.pageInfo.endCursor,
      requester: requester.kind,
    })
  } catch (err) {
    logger.error({
      source: "linear",
      route: "inbox",
      companyId: access.companyId,
      message: (err as Error).message,
    })
    if (err instanceof LinearError) return jsonError(err.message, 502)
    return jsonError("Failed to load inbox", 502)
  }
}
