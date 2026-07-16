export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { scheduledMeetingModel } from "@workspace/db/models"

const ROOM_RE = /^[a-z0-9-]{1,64}$/

/** Planlı toplantıya erken katılım payı (dk) — bu eşikten önce oda kilitli. */
export const EARLY_JOIN_MIN = 10

/**
 * GET /api/meet/room-status?room= — PUBLIC (cookie opsiyonel).
 *
 * Bir odanın planlı bir toplantıya ait olup olmadığını ve başlangıç zamanını
 * döner; meet web'in /call sayfası geri sayım kapısı + /api/token gating'i ve
 * mobil join akışı bunu tüketir. Oda adları tahmin-edilemez (sentroy-<12hex>)
 * ve dönen veri asgari — başlık yalnız organizatöre/katılımcıya görünür.
 * Cookie varsa `isOrganizer`/`isParticipant` hesaplanır (organizatör erken
 * katılım kapısından muaftır; token gating bunu kullanır).
 */
export async function GET(request: NextRequest) {
  const room = (new URL(request.url).searchParams.get("room") ?? "").trim().toLowerCase()
  if (!ROOM_RE.test(room)) return jsonError("Invalid room", 400)

  const meeting = await scheduledMeetingModel.findUpcomingByRoom(room)
  if (!meeting) return jsonSuccess({ scheduled: false })

  // Cookie opsiyonel — misafir istekleri de geçerli.
  const session = await getAuthSession(request).catch(() => null)
  const userId = session?.user?.id ?? null
  const email = session?.user?.email?.toLowerCase() ?? null

  const isOrganizer = Boolean(userId && meeting.organizerUserId === userId)
  const isParticipant =
    isOrganizer ||
    Boolean(email && meeting.participants.some((p) => p.email.toLowerCase() === email))

  const startMs = new Date(meeting.startAt).getTime()
  return jsonSuccess({
    scheduled: true,
    startAt: new Date(startMs).toISOString(),
    joinableAt: new Date(startMs - EARLY_JOIN_MIN * 60 * 1000).toISOString(),
    durationMin: meeting.durationMin,
    isOrganizer,
    isParticipant,
    // Başlık hafif hassas — yalnız ilgililere.
    ...(isParticipant ? { title: meeting.title, whenText: meeting.whenText } : {}),
  })
}
