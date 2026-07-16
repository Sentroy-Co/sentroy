export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { checkRateLimit, rateLimitResponse } from "@workspace/console/lib/rate-limit"
import { scheduledMeetingModel } from "@workspace/db/models"
import { audit } from "@workspace/console/lib/audit"
import { generateRoom, mailParticipants, normalizeParticipants, roomUrl } from "@/lib/meet-schedule"

/**
 * Planlanan toplantılar.
 *   GET  → organizatörün (oturumlu kullanıcı) toplantıları
 *   POST → yeni toplantı planla; oda üretilir, katılımcılara davet maili gider
 */
export async function GET(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session?.user?.id) return jsonError("Unauthorized", 401)
  const includePast = request.nextUrl.searchParams.get("includePast") === "true"
  const meetings = await scheduledMeetingModel.listByOrganizer(session.user.id, { includePast })
  return jsonSuccess(meetings)
}

export async function POST(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session?.user?.id) return jsonError("Unauthorized", 401)

  const rl = checkRateLimit(request, { key: "meet-schedule", window: 600, max: 20 })
  if (!rl.allowed) return rateLimitResponse(rl)

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

  const title = (body.title ?? "").trim().slice(0, 140)
  if (!title) return jsonError("Title is required", 400)

  const startAt = body.startAt ? new Date(body.startAt) : null
  if (!startAt || Number.isNaN(startAt.getTime())) return jsonError("Valid startAt is required", 400)
  if (startAt.getTime() < Date.now() - 60 * 1000) return jsonError("startAt must be in the future", 400)

  const whenText = (body.whenText ?? "").trim().slice(0, 120) || startAt.toISOString()
  const participants = normalizeParticipants(body.participants)
  if (participants.length === 0) return jsonError("At least one valid participant is required", 400)

  const room = generateRoom()
  const url = roomUrl(room)

  const meeting = await scheduledMeetingModel.create({
    organizerUserId: session.user.id,
    organizerName: session.user.name || session.user.email || "A Sentroy user",
    organizerEmail: session.user.email || "",
    room,
    url,
    title,
    startAt,
    whenText,
    durationMin: typeof body.durationMin === "number" ? body.durationMin : undefined,
    participants,
  })

  // Katılımcılara davet maili (best-effort).
  const mail = await mailParticipants("meeting.scheduled", meeting, {
    inviterName: meeting.organizerName,
    title: meeting.title,
    whenText: meeting.whenText,
    url: meeting.url,
  })

  await audit({
    userId: session.user.id,
    action: "meet.scheduled",
    resource: "meet",
    resourceId: meeting.id,
    details: { title, participants: participants.length, mailSent: mail.sent },
  })

  return jsonSuccess({ meeting, invited: mail.sent }, 201)
}
