import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { gatewayUrl, gatewayJsonHeaders } from "@/lib/gateway"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST — bir mesajın tam medyasını talep üzerine indirir (otomatik inmez). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; sessionId: string }> },
) {
  const { slug, sessionId } = await params
  const access = await resolveCompanyAccess(request, slug, "whatsapp.view")
  if ("error" in access) return access.error

  let body: { waMessageId?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }
  if (!body.waMessageId) return jsonError("'waMessageId' is required")

  let res: Response
  try {
    res = await fetch(
      gatewayUrl(`/sessions/${access.companyId}/${sessionId}/fetchmedia`),
      {
        method: "POST",
        headers: gatewayJsonHeaders(),
        body: JSON.stringify({ waMessageId: body.waMessageId }),
      },
    )
  } catch {
    return jsonError("WhatsApp gateway unreachable", 503)
  }
  const payload = await res.json().catch(() => ({}))
  if (!res.ok)
    return jsonError(
      (payload as { error?: string }).error || "Media fetch failed",
      res.status || 502,
    )
  return jsonSuccess(payload)
}
