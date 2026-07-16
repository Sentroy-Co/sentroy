export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { scheduledMeetingModel } from "@workspace/db/models"
import { audit } from "@workspace/console/lib/audit"
import { mailParticipants, normalizeParticipants } from "@/lib/meet-schedule"

/**
 * Tek toplantı — düzenle (PATCH) / iptal (DELETE). Yalnız organizatör.
 * Zaman/detay değişince katılımcılara "updated", iptalde "cancelled" maili.
 */

async function ownedMeeting(request: NextRequest, id: string) {
  const session = await getAuthSession(request)
  if (!session?.user?.id) return { error: jsonError("Unauthorized", 401) }
  const meeting = await scheduledMeetingModel.findById(id)
  if (!meeting) return { error: jsonError("Not found", 404) }
  if (meeting.organizerUserId !== session.user.id) return { error: jsonError("Forbidden", 403) }
  return { session, meeting, error: undefined }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await ownedMeeting(request, id)
  if (ctx.error) return ctx.error
  const { session, meeting } = ctx

  if (meeting.status === "cancelled") return jsonError("Meeting is cancelled", 409)

  let body: {
    title?: string
    startAt?: string
    whenText?: string
    durationMin?: number
    participants?: unknown
  } = {}
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const patch: Parameters<typeof scheduledMeetingModel.update>[1] = {}
  if (typeof body.title === "string") {
    const t = body.title.trim().slice(0, 140)
    if (!t) return jsonError("Title cannot be empty", 400)
    patch.title = t
  }
  let timeChanged = false
  if (body.startAt !== undefined) {
    const startAt = new Date(body.startAt)
    if (Number.isNaN(startAt.getTime())) return jsonError("Invalid startAt", 400)
    if (startAt.getTime() < Date.now() - 60 * 1000) return jsonError("startAt must be in the future", 400)
    patch.startAt = startAt
    timeChanged = startAt.getTime() !== new Date(meeting.startAt).getTime()
  }
  if (typeof body.whenText === "string") patch.whenText = body.whenText.trim().slice(0, 120)
  if (typeof body.durationMin === "number") patch.durationMin = body.durationMin
  if (body.participants !== undefined) {
    const ps = normalizeParticipants(body.participants)
    if (ps.length === 0) return jsonError("At least one valid participant is required", 400)
    patch.participants = ps
  }

  const updated = await scheduledMeetingModel.update(id, patch)
  if (!updated) return jsonError("Update failed", 500)

  // Zaman değiştiyse katılımcıları bilgilendir.
  if (timeChanged) {
    await mailParticipants("meeting.updated", updated, {
      inviterName: updated.organizerName,
      title: updated.title,
      whenText: updated.whenText,
      url: updated.url,
    })
  }

  await audit({
    userId: session.user.id,
    action: "meet.updated",
    resource: "meet",
    resourceId: id,
    details: { timeChanged },
  })

  return jsonSuccess({ meeting: updated })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await ownedMeeting(request, id)
  if (ctx.error) return ctx.error
  const { session, meeting } = ctx

  if (meeting.status === "cancelled") return jsonSuccess({ meeting })

  const cancelled = await scheduledMeetingModel.cancel(id)
  if (!cancelled) return jsonError("Cancel failed", 500)

  // İptal bilgisi katılımcılara.
  await mailParticipants("meeting.cancelled", cancelled, {
    inviterName: cancelled.organizerName,
    title: cancelled.title,
    whenText: cancelled.whenText,
  })

  await audit({
    userId: session.user.id,
    action: "meet.cancelled",
    resource: "meet",
    resourceId: id,
  })

  return jsonSuccess({ meeting: cancelled })
}
