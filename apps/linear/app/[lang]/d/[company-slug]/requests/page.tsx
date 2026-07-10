// Gelen kutusu ("Requests") — triage `inbox.tsx` loader'ının server portu
// (PLAN §3). Oturumdaki kullanıcının panelden gönderdiği talepler; satır
// açılınca thread client tarafında `inbox-thread` endpoint'inden lazy yüklenir.
import { notFound } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@workspace/auth/server/auth"
import { hasPermission } from "@workspace/auth/server/permissions"
import { getDb } from "@workspace/db/client"
import { linearInboxSeenModel } from "@workspace/db/models"

import { NotConnected } from "@/components/not-connected"
import { RequestsContent } from "@/components/requests/requests-content"
import { getLinearContext } from "@/lib/linear/context"
import { resolveRequester } from "@/lib/linear/mapping"
import { listInboxIssues } from "@/lib/linear/issues"
import { LinearError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import type { Issue } from "@/lib/linear/types"

export const dynamic = "force-dynamic"

export default async function RequestsPage({
  params,
}: {
  params: Promise<{ lang: string; "company-slug": string }>
}) {
  const { "company-slug": slug } = await params

  // Layout zaten session + membership guard'ı yapıyor; burada yalnız
  // companyId çözümü için tekrar okunur.
  const headersList = await headers()
  const session = await auth.api.getSession({ headers: headersList })
  if (!session) notFound()
  // Server-side gerçek yetki kapısı (RouteGuard client UX katmanı).
  const allowed = await hasPermission(session, slug, "linear.view")
  if (!allowed) notFound()

  const db = await getDb()
  const company = await db.collection("companies").findOne({ slug })
  if (!company) notFound()
  const companyId = company._id.toString()

  const ctx = await getLinearContext(companyId)
  if (!ctx) return <NotConnected />

  let issues: Issue[] = []
  let failed = false
  let errorMessage: string | null = null
  try {
    const requester = await resolveRequester(ctx, {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image,
    })
    const page = await listInboxIssues(ctx, { requester, pageSize: 50 })
    issues = page.nodes
    // Inbox görüldü → unread rozetini sıfırla (OS section tab). Fail-bypass:
    // seenAt yazımı başarısız olsa da sayfa render'ı bozulmasın.
    void linearInboxSeenModel
      .markSeen(companyId, session.user.id)
      .catch(() => {})
  } catch (err) {
    logger.error({
      source: "linear",
      route: "requests",
      companyId,
      message: (err as Error).message,
    })
    failed = true
    // LinearError mesajı kullanıcıya gösterilebilir; diğer hatalarda client
    // i18n fallback metnini (requests.loadError) kullanır.
    if (err instanceof LinearError) errorMessage = err.message
  }

  return (
    <RequestsContent
      issues={issues}
      userId={session.user.id}
      failed={failed}
      errorMessage={errorMessage}
    />
  )
}
