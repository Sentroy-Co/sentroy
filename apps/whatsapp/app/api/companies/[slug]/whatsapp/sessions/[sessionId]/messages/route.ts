import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { whatsappMessageModel, whatsappContactModel } from "@workspace/db/models"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** DELETE — bir mesajı panelden sil (yerel). `?waMessageId=`. whatsapp.send. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; sessionId: string }> },
) {
  const { slug, sessionId } = await params
  const access = await resolveCompanyAccess(request, slug, "whatsapp.send")
  if ("error" in access) return access.error

  const waMessageId = request.nextUrl.searchParams.get("waMessageId")
  if (!waMessageId) return jsonError("'waMessageId' is required")

  const ok = await whatsappMessageModel.deleteByWaId(
    access.companyId,
    sessionId,
    waMessageId,
  )
  return jsonSuccess({ ok })
}

/** GET — bir sohbetin mesaj geçmişi (kronolojik). `chatJid` zorunlu. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; sessionId: string }> },
) {
  const { slug, sessionId } = await params
  const access = await resolveCompanyAccess(request, slug, "whatsapp.view")
  if ("error" in access) return access.error

  const sp = request.nextUrl.searchParams
  const chatJid = sp.get("chatJid")
  if (!chatJid) return jsonError("chatJid is required")

  const limit = Math.min(Math.max(Number(sp.get("limit") || "50"), 1), 200)
  const beforeRaw = sp.get("before")
  const before = beforeRaw ? new Date(beforeRaw) : undefined

  const messages = await whatsappMessageModel.findByChat(
    access.companyId,
    sessionId,
    chatJid,
    { limit, before },
  )

  if (!before) {
    await whatsappContactModel.resetUnread(access.companyId, sessionId, chatJid)
  }

  return jsonSuccess(messages)
}
