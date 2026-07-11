export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { assertAdmin } from "@workspace/console/lib/admin-access"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { audit } from "@workspace/console/lib/audit"
import { sendSystemMailEvent } from "@workspace/auth/server/system-mail-events"
import { contactMessageModel } from "@workspace/db/models"
import type { ContactMessageStatus } from "@workspace/db/models/contact-message"
import { htmlifyMultiline } from "@/lib/contact"

export const runtime = "nodejs"

const STATUSES: ContactMessageStatus[] = ["new", "open", "replied", "closed"]

/** PATCH — durum ve/veya atama güncelle. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error
  const { id } = await params

  let body: { status?: string; assignedToUserId?: string | null }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid body")
  }

  if (body.status === undefined && body.assignedToUserId === undefined) {
    return jsonError("Nothing to update")
  }

  let updated = null
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status as ContactMessageStatus)) return jsonError("Invalid status")
    updated = await contactMessageModel.updateStatus(id, body.status as ContactMessageStatus)
  }
  if (body.assignedToUserId !== undefined) {
    updated = await contactMessageModel.assign(id, body.assignedToUserId || null)
  }
  if (!updated) return jsonError("Message not found", 404)

  await audit({
    userId: access.session.user.id,
    action: "contact.message.update",
    resource: "contact-message",
    resourceId: id,
    request,
  }).catch(() => {})

  return jsonSuccess(updated)
}

/** POST — admin yanıtı ekle → status "replied" + gönderene contact.reply maili
 *  (orijinal mesaj + yanıt, gönderenin dilinde). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error
  const { id } = await params

  let body: { body?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid body")
  }
  const replyBody = (body.body ?? "").trim().slice(0, 5000)
  if (replyBody.length < 1) return jsonError("Reply is required")

  const existing = await contactMessageModel.findById(id)
  if (!existing) return jsonError("Message not found", 404)

  const authorName = access.session.user.name || access.session.user.email || "Sentroy"
  const updated = await contactMessageModel.appendReply(id, {
    authorUserId: access.session.user.id,
    authorName,
    body: replyBody,
  })
  if (!updated) return jsonError("Message not found", 404)

  // Gönderene yanıtı ilet (yalnız e-posta verdiyse), gönderenin dilinde.
  if (existing.email) {
    void sendSystemMailEvent("contact.reply", {
      to: existing.email,
      locale: existing.locale || "en",
      variables: {
        name: existing.name,
        replyBody: htmlifyMultiline(replyBody),
        originalMessage: htmlifyMultiline(existing.message),
      },
    })
  }

  await audit({
    userId: access.session.user.id,
    action: "contact.message.reply",
    resource: "contact-message",
    resourceId: id,
    request,
  }).catch(() => {})

  return jsonSuccess(updated)
}
