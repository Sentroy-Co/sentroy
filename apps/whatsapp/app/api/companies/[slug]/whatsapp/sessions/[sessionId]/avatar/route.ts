import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { gatewayUrl, gatewayJsonHeaders } from "@/lib/gateway"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST — bir kişinin WhatsApp profil fotosunu on-demand çek (sohbet açılınca).
 * Gateway profilePictureUrl'i çekip contact'a yazar + döner. whatsapp.view.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; sessionId: string }> },
) {
  const { slug, sessionId } = await params
  const access = await resolveCompanyAccess(request, slug, "whatsapp.view")
  if ("error" in access) return access.error

  let body: { jid?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }
  if (!body.jid) return jsonError("'jid' is required")

  try {
    const res = await fetch(
      gatewayUrl(`/sessions/${access.companyId}/${sessionId}/avatar`),
      {
        method: "POST",
        headers: gatewayJsonHeaders(),
        body: JSON.stringify({ jid: body.jid }),
      },
    )
    if (!res.ok) return jsonSuccess({ avatarUrl: null })
    return jsonSuccess(await res.json())
  } catch {
    return jsonSuccess({ avatarUrl: null })
  }
}
