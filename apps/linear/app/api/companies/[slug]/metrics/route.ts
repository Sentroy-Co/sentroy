import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getLinearContext } from "@/lib/linear/context"
import { computeMetrics } from "@/lib/metrics"
import { LinearError } from "@/lib/errors"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /metrics — analitik JSON (Sentroy Tasks mobil). Web'de yalnız RSC
 * `metrics/page.tsx`'te render ediliyordu; `computeMetrics` (toplam/açık/
 * tamamlanan, state/priority bucket'ları, top kişiler/etiketler, timeline,
 * stale) köprüsü. linear.view — toplam veri (panel showAllIssues ile aynı
 * görünürlük). 412 not_connected.
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

  try {
    const metrics = await computeMetrics(ctx)
    return jsonSuccess(metrics)
  } catch (err) {
    logger.error({
      source: "linear",
      route: "metrics",
      companyId: access.companyId,
      message: (err as Error).message,
    })
    if (err instanceof LinearError) return jsonError(err.message, 502)
    return jsonError("Failed to compute metrics", 502)
  }
}
