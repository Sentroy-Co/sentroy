import { notFound } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@workspace/auth/server/auth"
import { hasPermission } from "@workspace/auth/server/permissions"
import { getDb } from "@workspace/db/client"
import { getLinearContext } from "@/lib/linear/context"
import { getIssue } from "@/lib/linear/issues"
import { loadNewTaskForm } from "@/lib/new-task-loader"
import { logger } from "@/lib/logger"
import { NotConnected } from "@/components/not-connected"
import {
  NewTaskContent,
  type NewTaskLoaderData,
} from "@/components/new-task/new-task-content"
import type { IssueParentRef } from "@/lib/linear/types"

export const dynamic = "force-dynamic"

/**
 * Yeni Talep sayfası (triage tasks.new.tsx loader portu).
 *
 * Takım seçici görünür olduğunda kullanıcı takımı değiştirebildiği için tüm
 * takımların state/label/şablonunu önden yükleriz; form seçili takıma göre
 * ilgili seti gösterir (Linear'da bunlar takıma özeldir). `?parentId=` verilirse
 * üst talep çözülür ve varsayılan takım üst talebin takımı olur.
 *
 * Action tarafı: POST /api/companies/[slug]/issues (shim `/tasks/new` →
 * `${apiBase}/issues` eşler; bkz. lib/router-compat.tsx).
 */
export default async function NewTaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string; "company-slug": string }>
  searchParams: Promise<{ parentId?: string }>
}) {
  const { "company-slug": slug } = await params
  const { parentId } = await searchParams
  const parentParam = parentId?.trim() || null

  // RouteGuard yalnız client-side UX katmanı; server-side gerçek kapı burada.
  // Talep oluşturma sayfası olduğu için linear.edit gerekir (POST /issues de
  // aynı yetkiyi zorlar). Yetkisize varlık sızmasın diye notFound().
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) notFound()
  const allowed = await hasPermission(session, slug, "linear.edit")
  if (!allowed) notFound()

  const db = await getDb()
  const company = await db.collection("companies").findOne({ slug })
  if (!company) notFound()
  const companyId = company._id.toString()

  // Linear bağlı değilse (API key yok / decrypt edilemedi) CTA göster.
  const ctx = await getLinearContext(companyId)
  if (!ctx) {
    return <NotConnected />
  }

  let data: NewTaskLoaderData
  try {
    let parent: IssueParentRef | null = null
    let parentTeamId: string | null = null
    if (parentParam) {
      const found = await getIssue(ctx, parentParam).catch(() => null)
      if (found) {
        parent = {
          id: found.issue.id,
          identifier: found.issue.identifier,
          title: found.issue.title,
        }
        parentTeamId = found.issue.team.id
      }
    }

    const load = await loadNewTaskForm(ctx, companyId, {
      preferTeamId: parentTeamId,
    })
    data = load.ok ? { ...load, parent } : { ok: false, errorKey: load.errorKey }
  } catch (err) {
    logger.error({
      source: "linear",
      route: "tasks.new",
      companyId,
      message: (err as Error).message,
    })
    data = { ok: false, errorKey: "loadFailed" }
  }

  return <NewTaskContent data={data} />
}
