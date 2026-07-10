import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonSuccess } from "@workspace/console/lib/api-helpers"
import { whatsappSendLogModel } from "@workspace/db/models"
import type { WhatsappSendStatus } from "@workspace/db/models/whatsapp-send-log"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /logs — API/template ile yapılan gönderim logları (sayfalı + filtreli). whatsapp.view. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await resolveCompanyAccess(request, slug, "whatsapp.view")
  if ("error" in access) return access.error

  const q = new URL(request.url).searchParams
  const rawStatus = q.get("status")
  const status: WhatsappSendStatus | undefined =
    rawStatus === "sent" || rawStatus === "failed" || rawStatus === "queued"
      ? rawStatus
      : undefined

  const result = await whatsappSendLogModel.list(access.companyId, {
    page: q.get("page") ? parseInt(q.get("page")!, 10) : undefined,
    limit: q.get("limit") ? parseInt(q.get("limit")!, 10) : undefined,
    status,
    sessionId: q.get("sessionId") || undefined,
    templateId: q.get("templateId") || undefined,
  })
  return jsonSuccess(result)
}
