import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonSuccess } from "@workspace/console/lib/api-helpers"
import { whatsappMessageModel, whatsappContactModel } from "@workspace/db/models"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET — bir numaranın TÜM sohbetlerinde mesaj gövdesi araması. Sonuçlar
 * sohbet adıyla zenginleştirilir ki UI sonuçtan ilgili sohbete atlayabilsin.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; sessionId: string }> },
) {
  const { slug, sessionId } = await params
  const access = await resolveCompanyAccess(request, slug, "whatsapp.view")
  if ("error" in access) return access.error

  const q = (request.nextUrl.searchParams.get("q") || "").trim()
  if (!q) return jsonSuccess([])

  const messages = await whatsappMessageModel.searchByBody(
    access.companyId,
    sessionId,
    q,
    40,
  )
  if (messages.length === 0) return jsonSuccess([])

  const jids = Array.from(new Set(messages.map((m) => m.chatJid)))
  const contacts = await whatsappContactModel.findByJids(
    access.companyId,
    sessionId,
    jids,
  )
  const nameMap = new Map(
    contacts.map((c) => [
      c.jid,
      c.name || c.pushName || c.phone || c.jid.split("@")[0] || c.jid,
    ]),
  )

  return jsonSuccess(
    messages.map((m) => ({
      waMessageId: m.waMessageId,
      chatJid: m.chatJid,
      body: m.body,
      fromMe: m.fromMe,
      type: m.type,
      timestamp: m.timestamp,
      chatName: nameMap.get(m.chatJid) || m.chatJid.split("@")[0] || m.chatJid,
    })),
  )
}
