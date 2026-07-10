// İstatistikler — triage `metrics.tsx` loader'ının server portu (PLAN §3).
// Hesaplama katmanı `lib/metrics.ts` içinde; bu sayfa yalnız context çözer,
// computeMetrics çağırır ve sonucu client bileşene aktarır.
import { notFound } from "next/navigation"
import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import { auth } from "@workspace/auth/server/auth"
import { hasPermission } from "@workspace/auth/server/permissions"
import { getDb } from "@workspace/db/client"

import { NotConnected } from "@/components/not-connected"
import { MetricsContent } from "@/components/metrics/metrics-content"
import { ErrorState } from "@/components/common/error-state"
import { getLinearContext } from "@/lib/linear/context"
import { computeMetrics } from "@/lib/metrics"
import { LinearError } from "@/lib/errors"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"

export default async function MetricsPage({
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
  // Server-side gerçek yetki kapısı (RouteGuard client UX; RSC payload'u
  // yetkisiz üyeye teslim edilirdi).
  const allowed = await hasPermission(session, slug, "linear.view")
  if (!allowed) notFound()

  const db = await getDb()
  const company = await db.collection("companies").findOne({ slug })
  if (!company) notFound()
  const companyId = company._id.toString()

  const ctx = await getLinearContext(companyId)
  if (!ctx) return <NotConnected />

  try {
    const metrics = await computeMetrics(ctx)
    return <MetricsContent metrics={metrics} />
  } catch (err) {
    logger.error({
      source: "linear",
      route: "metrics",
      companyId,
      message: (err as Error).message,
    })
    const t = await getTranslations("linearLite.metrics")
    return (
      <div className="p-6">
        <ErrorState
          description={
            err instanceof LinearError ? err.message : t("loadError")
          }
        />
      </div>
    )
  }
}
