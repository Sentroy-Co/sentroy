import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonSuccess } from "@workspace/console/lib/api-helpers"
import { whatsappSessionModel } from "@workspace/db/models"
import type { WhatsappSession } from "@workspace/db/models/whatsapp-session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /numbers — şirketin WhatsApp numaraları (session'ları). SDK
 * `whatsapp.numbers.list()` + CLI `whatsapp numbers list`. Gönderimde `from`
 * olarak `connected` olanlardan biri kullanılır. credsBlob asla sızdırılmaz.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await resolveCompanyAccess(request, slug, "whatsapp.view")
  if ("error" in access) return access.error

  const sessions = await whatsappSessionModel.listByCompany(access.companyId)
  return jsonSuccess(
    sessions.map((s: WhatsappSession) => ({
      sessionId: s.sessionId,
      phoneNumber: s.phoneNumber,
      label: s.label,
      status: s.status,
      connected: s.status === "connected",
    })),
  )
}
