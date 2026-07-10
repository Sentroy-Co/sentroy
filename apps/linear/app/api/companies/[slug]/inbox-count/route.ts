import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { linearInboxSeenModel } from "@workspace/db/models"
import { getLinearContext } from "@/lib/linear/context"
import { resolveRequester, type PanelUser } from "@/lib/linear/mapping"
import { listInboxIssues } from "@/lib/linear/issues"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /inbox-count — kullanıcının Inbox'ında okunmamış (son görülmeden sonra
 * güncellenen) talep sayısı. OS section tab rozeti bunu poll'ler (core →
 * `/api/linear/companies/[slug]/inbox-count` rewrite). Linear bağlı değilse
 * ya da hata olursa count 0 (rozet gösterilmez). Inbox sayfası açılınca
 * requests/page.tsx `markSeen` çağırır → seenAt=now → sonraki poll 0 döner.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await resolveCompanyAccess(request, slug, "linear.view")
  if ("error" in access) return access.error

  const ctx = await getLinearContext(access.companyId).catch(() => null)
  if (!ctx) return jsonSuccess({ count: 0 })

  const email = access.session?.user.email ?? access.callerEmail ?? null
  const panelUser: PanelUser = {
    id: access.callerUserId,
    email,
    name: access.session?.user.name ?? null,
    image: access.session?.user.image ?? null,
  }

  try {
    const requester = await resolveRequester(ctx, panelUser)
    const [page, seenAt] = await Promise.all([
      listInboxIssues(ctx, { requester, pageSize: 50 }),
      linearInboxSeenModel.getSeenAt(access.companyId, access.callerUserId),
    ])
    // seenAt yoksa hepsi okunmamış; varsa updatedAt > seenAt olanlar.
    const seenMs = seenAt ? new Date(seenAt).getTime() : 0
    const count = page.nodes.filter(
      (i) => new Date(i.updatedAt).getTime() > seenMs,
    ).length
    return jsonSuccess({ count })
  } catch (err) {
    logger.warn({
      source: "linear",
      route: "inbox-count",
      companyId: access.companyId,
      message: (err as Error).message,
    })
    return jsonSuccess({ count: 0 })
  }
}
