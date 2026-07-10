import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { whatsappMessageModel } from "@workspace/db/models"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET — kişi detayı sekmeleri: sohbetin paylaşılan medya/döküman/link'leri.
 * `chatJid` + `kind=media|docs|links`. whatsapp.view.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; sessionId: string }> },
) {
  const { slug, sessionId } = await params
  const access = await resolveCompanyAccess(request, slug, "whatsapp.view")
  if ("error" in access) return access.error

  const sp = request.nextUrl.searchParams
  const chatJid = sp.get("chatJid")
  const kind = sp.get("kind")
  if (!chatJid) return jsonError("chatJid is required")
  if (kind !== "media" && kind !== "docs" && kind !== "links")
    return jsonError("kind must be media|docs|links")

  const items = await whatsappMessageModel.findSharedByChat(
    access.companyId,
    sessionId,
    chatJid,
    kind,
  )
  return jsonSuccess(items)
}
