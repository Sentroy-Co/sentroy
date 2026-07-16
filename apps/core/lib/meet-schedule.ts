import { randomUUID } from "crypto"
import { sendSystemMailEvent } from "@workspace/auth/server/system-mail-events"
import { serverRootDomain, subAppOrigin } from "@workspace/auth/lib/domains"
import type { MeetingParticipant, ScheduledMeeting } from "@workspace/db/models/scheduled-meeting"

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** meet.<root> origin — davet/katılım linkleri buradan. */
export function meetOrigin(): string {
  return subAppOrigin(serverRootDomain(), "meet")
}

/** Sunucu tarafı oda üret — [a-z0-9-], tahmin edilemez. */
export function generateRoom(): string {
  return `sentroy-${randomUUID().replace(/-/g, "").slice(0, 12)}`
}

export function roomUrl(room: string): string {
  return `${meetOrigin()}/call/${room}`
}

/** İstemciden gelen ham katılımcıları doğrula + normalize et (max 50). */
export function normalizeParticipants(raw: unknown): MeetingParticipant[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: MeetingParticipant[] = []
  for (const p of raw) {
    const email = String((p as { email?: unknown })?.email ?? "").trim().toLowerCase()
    if (!EMAIL_RE.test(email) || email.length > 254 || seen.has(email)) continue
    seen.add(email)
    const nameRaw = (p as { name?: unknown })?.name
    const name = typeof nameRaw === "string" && nameRaw.trim() ? nameRaw.trim().slice(0, 120) : null
    out.push({ email, name })
    if (out.length >= 50) break
  }
  return out
}

/**
 * Bir mail eventini tüm katılımcılara gönder (best-effort, tek tek). Dönen
 * değer kaç maile gönderildiği/başarısız olduğu — çağıran loglar.
 */
export async function mailParticipants(
  eventKey: string,
  meeting: Pick<ScheduledMeeting, "participants">,
  variables: Record<string, string>,
): Promise<{ sent: number; failed: number }> {
  let sent = 0
  let failed = 0
  for (const p of meeting.participants) {
    const res = await sendSystemMailEvent(eventKey, {
      to: p.email,
      variables: { ...variables, participantName: p.name ?? "" },
    })
    if (res.sent) sent++
    else failed++
  }
  return { sent, failed }
}
