import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { gatewayUrl, gatewayJsonHeaders } from "@/lib/gateway"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST — bir mesaja emoji tepki gönder/kaldır. whatsapp.send. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; sessionId: string }> },
) {
  const { slug, sessionId } = await params
  const access = await resolveCompanyAccess(request, slug, "whatsapp.send")
  if ("error" in access) return access.error

  let body: {
    chatJid?: string
    waMessageId?: string
    fromMe?: boolean
    emoji?: string
    senderJid?: string | null
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }
  if (!body.chatJid || !body.waMessageId)
    return jsonError("'chatJid' and 'waMessageId' are required")

  let res: Response
  try {
    res = await fetch(
      gatewayUrl(`/sessions/${access.companyId}/${sessionId}/react`),
      {
        method: "POST",
        headers: gatewayJsonHeaders(),
        body: JSON.stringify({
          chatJid: body.chatJid,
          waMessageId: body.waMessageId,
          fromMe: !!body.fromMe,
          emoji: body.emoji ?? "",
          senderJid: body.senderJid ?? null,
        }),
      },
    )
  } catch {
    return jsonError("WhatsApp gateway unreachable", 503)
  }
  const payload = await res.json().catch(() => ({}))
  if (!res.ok)
    return jsonError((payload as { error?: string }).error || "React failed", res.status || 502)
  return jsonSuccess(payload)
}
