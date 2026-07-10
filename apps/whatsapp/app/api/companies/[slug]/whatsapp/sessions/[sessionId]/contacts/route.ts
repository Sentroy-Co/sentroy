import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { audit } from "@workspace/console/lib/audit"
import { whatsappContactModel, whatsappMessageModel } from "@workspace/db/models"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET — bir numaranın sohbet listesi (pinned önce, son mesaja göre sıralı). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; sessionId: string }> },
) {
  const { slug, sessionId } = await params
  const access = await resolveCompanyAccess(request, slug, "whatsapp.view")
  if ("error" in access) return access.error

  const sp = request.nextUrl.searchParams
  const q = sp.get("q") || undefined
  const limit = Math.min(Math.max(Number(sp.get("limit") || "100"), 1), 300)
  const skip = Math.max(Number(sp.get("skip") || "0"), 0)
  const includeArchived = sp.get("archived") === "true"

  const contacts = await whatsappContactModel.findBySession(
    access.companyId,
    sessionId,
    { q, limit, skip, includeArchived },
  )
  return jsonSuccess(contacts)
}

/** PATCH — sohbet arşivle/pinle. { jid, archived?, pinned? }. whatsapp.send. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; sessionId: string }> },
) {
  const { slug, sessionId } = await params
  const access = await resolveCompanyAccess(request, slug, "whatsapp.send")
  if ("error" in access) return access.error

  let body: {
    jid?: string
    archived?: boolean
    pinned?: boolean
    customName?: string | null
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }
  if (!body.jid) return jsonError("'jid' is required")

  let updated = null
  if (body.customName !== undefined) {
    updated = await whatsappContactModel.setCustomName(
      access.companyId,
      sessionId,
      body.jid,
      body.customName,
    )
  }
  if (body.archived !== undefined || body.pinned !== undefined) {
    updated = await whatsappContactModel.setFlags(
      access.companyId,
      sessionId,
      body.jid,
      { archived: body.archived, pinned: body.pinned },
    )
  }
  if (!updated) return jsonError("Chat not found or nothing to update", 404)
  return jsonSuccess(updated)
}

/** DELETE — sohbeti panelden sil (kişi + mesajları). `?jid=`. whatsapp.send. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; sessionId: string }> },
) {
  const { slug, sessionId } = await params
  const access = await resolveCompanyAccess(request, slug, "whatsapp.send")
  if ("error" in access) return access.error

  const jid = request.nextUrl.searchParams.get("jid")
  if (!jid) return jsonError("'jid' is required")

  await Promise.all([
    whatsappContactModel.deleteChat(access.companyId, sessionId, jid),
    whatsappMessageModel.deleteByChat(access.companyId, sessionId, jid),
  ])

  await audit({
    userId: access.callerUserId,
    companyId: access.companyId,
    action: "whatsapp.chat.delete",
    resource: "whatsapp-chat",
    resourceId: jid,
    details: { sessionId },
  })

  return jsonSuccess({ ok: true })
}
