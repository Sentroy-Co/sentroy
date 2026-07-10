import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { audit } from "@workspace/console/lib/audit"
import { gatewayUrl, gatewayJsonHeaders } from "@/lib/gateway"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST — bir numaradan metin mesaj gönder. whatsapp.send. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; sessionId: string }> },
) {
  const { slug, sessionId } = await params
  const access = await resolveCompanyAccess(request, slug, "whatsapp.send")
  if ("error" in access) return access.error

  let body: { to?: string; text?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }
  if (!body.to || typeof body.to !== "string") return jsonError("'to' is required")
  if (!body.text || typeof body.text !== "string" || !body.text.trim())
    return jsonError("'text' is required")

  let res: Response
  try {
    res = await fetch(
      gatewayUrl(`/sessions/${access.companyId}/${sessionId}/send`),
      {
        method: "POST",
        headers: gatewayJsonHeaders(),
        body: JSON.stringify({ to: body.to, text: body.text }),
      },
    )
  } catch {
    return jsonError("WhatsApp gateway unreachable", 503)
  }

  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    return jsonError(
      (payload as { error?: string }).error || "Send failed",
      res.status || 502,
    )
  }

  await audit({
    userId: access.callerUserId,
    companyId: access.companyId,
    action: "whatsapp.send",
    resource: "whatsapp-message",
    resourceId: (payload as { waMessageId?: string }).waMessageId || undefined,
    details: { to: body.to, sessionId },
  })

  return jsonSuccess(payload)
}
