// Talep detay sayfası — triage `tasks.$id.tsx` loader'ının server portu
// (PLAN §3). Veri burada çekilir, client içerik <TaskDetailContent>'e props
// olarak iner. Action'lar `/api/companies/[slug]/issues/[id]/actions`
// endpoint'ine gider (router-compat shim eşler).
import { notFound } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@workspace/auth/server/auth"
import { hasPermission } from "@workspace/auth/server/permissions"
import { getDb } from "@workspace/db/client"

import { NotConnected } from "@/components/not-connected"
import { TaskDetailContent } from "@/components/task-detail/task-detail-content"
import { getLinearContext } from "@/lib/linear/context"
import { resolveRequester } from "@/lib/linear/mapping"
import { getIssue } from "@/lib/linear/issues"
import { getTeamLabels, getTeamStates } from "@/lib/linear/metadata"
import { getAllLinearUsers } from "@/lib/linear/users"
import { canViewIssue, stripProxyHeader } from "@/lib/linear/access"
import { remapDescriptionImages } from "@/lib/image-assets"
import { getUiFlagsForCompany } from "@/lib/settings"
import type {
  IssueLabel,
  IssueState,
  IssueUser,
} from "@/lib/linear/types"

export const dynamic = "force-dynamic"

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ lang: string; "company-slug": string; id: string }>
}) {
  const { "company-slug": slug, id } = await params
  if (!id) notFound()

  // Layout zaten session + membership guard'ı yapıyor; burada yalnız
  // companyId çözümü için tekrar okunur (page'ler layout verisine erişemez).
  const headersList = await headers()
  const session = await auth.api.getSession({ headers: headersList })
  if (!session) notFound()
  // Server-side gerçek yetki kapısı (RouteGuard yalnız client UX katmanı,
  // RSC payload'u zaten teslim edilmiş olurdu).
  const allowed = await hasPermission(session, slug, "linear.view")
  if (!allowed) notFound()

  const db = await getDb()
  const company = await db.collection("companies").findOne({ slug })
  if (!company) notFound()
  const companyId = company._id.toString()

  const ctx = await getLinearContext(companyId)
  if (!ctx) return <NotConnected />

  const requester = await resolveRequester(ctx, {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image,
  })

  const result = await getIssue(ctx, id)
  if (!result) notFound()

  if (!canViewIssue(result.issue, requester)) {
    // Triage parity: yetkisizlik varlık bilgisi sızdırmasın diye 404.
    notFound()
  }

  const flags = await getUiFlagsForCompany(companyId)
  const teamId = result.issue.team.id

  // Metadata yalnız ilgili UI flag açıksa çekilir; kapalıyken ilgili
  // kontroller zaten render edilmez, boş dizi yeter.
  const [states, labels, users] = await Promise.all([
    flags.showStatus
      ? getTeamStates(ctx, teamId).catch(() => [] as IssueState[])
      : Promise.resolve([] as IssueState[]),
    flags.showLabels
      ? getTeamLabels(ctx, teamId).catch(() => [] as IssueLabel[])
      : Promise.resolve([] as IssueLabel[]),
    flags.showAssignee
      ? getAllLinearUsers(ctx).catch(() => [] as IssueUser[])
      : Promise.resolve([] as IssueUser[]),
  ])

  // Linear, gövde görsellerini kendi CDN'ine re-host ediyor; token'lı
  // görselleri Sentroy (public, optimize) URL'ine geri çevir.
  const cleanDescription = await remapDescriptionImages(
    companyId,
    stripProxyHeader(result.issue.description),
  )

  return (
    <TaskDetailContent
      issue={result.issue}
      comments={result.comments}
      attachments={result.attachments}
      history={result.history}
      childIssues={result.children}
      cleanDescription={cleanDescription}
      states={states}
      labels={labels}
      users={users}
      showStatus={flags.showStatus}
      showAssignee={flags.showAssignee}
      showLabels={flags.showLabels}
      showLinkedIssues={flags.showLinkedIssues}
    />
  )
}
