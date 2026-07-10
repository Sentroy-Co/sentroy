import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getLinearContext } from "@/lib/linear/context"
import { searchIssues } from "@/lib/linear/issues"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /search?q= — komut paletinin kullandığı arama köprüsü (triage
 * api.search portu). linear.view. Boş query → boş liste. Linear'ın
 * searchIssues query'sine maks. 8 sonuçla bağlanır.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await resolveCompanyAccess(request, slug, "linear.view")
  if ("error" in access) return access.error

  const term = request.nextUrl.searchParams.get("q")?.trim() ?? ""
  if (!term) return jsonSuccess({ term, results: [] })

  const ctx = await getLinearContext(access.companyId)
  if (!ctx) return jsonError("not_connected", 412)

  try {
    const results = await searchIssues(ctx, term, 8)
    return jsonSuccess({ term, results })
  } catch (err) {
    logger.error({
      source: "linear",
      route: "search",
      companyId: access.companyId,
      message: (err as Error).message,
    })
    return jsonError("Search failed", 502)
  }
}
