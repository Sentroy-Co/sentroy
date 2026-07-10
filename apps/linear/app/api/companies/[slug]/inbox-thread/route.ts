import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"

import { getLinearContext } from "@/lib/linear/context"
import { getIssue } from "@/lib/linear/issues"
import { stripProxyHeader } from "@/lib/linear/access"
import { remapDescriptionImages } from "@/lib/image-assets"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/companies/[slug]/inbox-thread?id=… — Gelen kutusu satırı
 * açıldığında thread'i (açıklama + durum geçmişi + yorumlar + ekler) lazy
 * yükler (triage `api.inbox-thread` portu). Detay sayfası verisinin hafif
 * bir alt kümesi; yanıt yazma yine `issues/[id]/actions` endpoint'ine
 * (intent=comment) gider, dolayısıyla bu salt-okuma.
 *
 * Permission: linear.view. Linear bağlı değilse 412 "not_connected".
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

  const id = request.nextUrl.searchParams.get("id")?.trim()
  if (!id) return jsonError("'id' is required")

  try {
    const result = await getIssue(ctx, id)
    if (!result) return jsonError("Issue not found", 404)
    return jsonSuccess({
      issue: result.issue,
      // Linear, gövde görsellerini kendi CDN'ine re-host ediyor; token'lı
      // görselleri Sentroy (public, optimize) URL'ine geri çevir.
      cleanDescription: await remapDescriptionImages(
        ctx.companyId,
        stripProxyHeader(result.issue.description),
      ),
      comments: result.comments,
      history: result.history,
      attachments: result.attachments,
    })
  } catch (err) {
    logger.error({
      source: "linear",
      route: "api.inbox-thread",
      companyId: ctx.companyId,
      message: (err as Error).message,
    })
    return jsonError("Thread could not be loaded", 502)
  }
}
