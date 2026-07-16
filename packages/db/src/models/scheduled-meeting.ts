import { ObjectId } from "mongodb"
import { getDb } from "../client"
import { toId } from "./_helpers"

/**
 * Planlanan Sentroy Meet toplantıları. Organizatör (oturumlu kullanıcı) bir
 * oda + zaman + katılımcı listesiyle toplantı planlar; katılımcılara davet
 * maili gider, başlangıca 15 dk kala hatırlatma maili, düzenleme/iptalde de
 * bilgilendirme maili iletilir (bkz. system-mail-events meeting.*).
 *
 * Şirket-kapsamı opsiyonel (companyId) — liste sorgusu organizatör bazlıdır.
 * reminderSentAt idempotent hatırlatma sweep'i için (worker/cron).
 */

const COLLECTION = "scheduled_meetings"

export type ScheduledMeetingStatus = "scheduled" | "cancelled"

export interface MeetingParticipant {
  email: string
  name: string | null
}

export interface ScheduledMeeting {
  id: string
  companyId: string | null
  organizerUserId: string
  organizerName: string
  organizerEmail: string
  room: string
  url: string
  title: string
  /** Toplantı başlangıcı (UTC mutlak an — hatırlatma zamanlaması bununla). */
  startAt: Date
  /** Organizatörün gördüğü biçimli zaman metni (mail gösterimi — TZ tahmini
   *  yapmadan tüm katılımcılara tutarlı gösterim). */
  whenText: string
  durationMin: number
  participants: MeetingParticipant[]
  status: ScheduledMeetingStatus
  /** T-15 hatırlatma maili gönderildiyse zaman damgası (idempotent sweep). */
  reminderSentAt: Date | null
  createdAt: Date
  updatedAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function create(data: {
  companyId?: string | null
  organizerUserId: string
  organizerName: string
  organizerEmail: string
  room: string
  url: string
  title: string
  startAt: Date
  whenText: string
  durationMin?: number
  participants: MeetingParticipant[]
}): Promise<ScheduledMeeting> {
  const c = await col()
  const now = new Date()
  const doc = {
    companyId: data.companyId ?? null,
    organizerUserId: data.organizerUserId,
    organizerName: data.organizerName,
    organizerEmail: data.organizerEmail,
    room: data.room,
    url: data.url,
    title: data.title,
    startAt: data.startAt,
    whenText: data.whenText,
    durationMin: data.durationMin ?? 30,
    participants: data.participants,
    status: "scheduled" as ScheduledMeetingStatus,
    reminderSentAt: null as Date | null,
    createdAt: now,
    updatedAt: now,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

export async function findById(id: string): Promise<ScheduledMeeting | null> {
  if (!ObjectId.isValid(id)) return null
  const c = await col()
  return toId(await c.findOne({ _id: new ObjectId(id) })) as ScheduledMeeting | null
}

/**
 * Oda için yaklaşan/devam-eden planlı toplantı — erken-katılım kapısı için
 * (room-status endpoint'i + meet token gating). "Devam eden" payı: başlangıcı
 * son 6 saatte olanlar da döner (uzun toplantı + geç katılan); daha eskiler
 * bitti sayılır. Oda birden fazla kez planlandıysa en yakın başlangıç kazanır.
 */
export async function findUpcomingByRoom(room: string): Promise<ScheduledMeeting | null> {
  const c = await col()
  const doc = await c
    .find({
      room,
      status: "scheduled",
      startAt: { $gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
    })
    .sort({ startAt: 1 })
    .limit(1)
    .next()
  return doc ? (toId(doc) as ScheduledMeeting) : null
}

/** Organizatörün toplantıları — varsayılan yalnız gelecekteki + iptal olmayanlar. */
export async function listByOrganizer(
  organizerUserId: string,
  opts?: { includePast?: boolean; includeCancelled?: boolean },
): Promise<ScheduledMeeting[]> {
  const c = await col()
  const q: Record<string, unknown> = { organizerUserId }
  if (!opts?.includeCancelled) q.status = "scheduled"
  if (!opts?.includePast) q.startAt = { $gte: new Date(Date.now() - 60 * 60 * 1000) }
  const docs = await c.find(q).sort({ startAt: 1 }).limit(100).toArray()
  return docs.map((d) => toId(d) as ScheduledMeeting)
}

export async function update(
  id: string,
  patch: Partial<Pick<ScheduledMeeting, "title" | "startAt" | "whenText" | "durationMin" | "participants">>,
): Promise<ScheduledMeeting | null> {
  if (!ObjectId.isValid(id)) return null
  const c = await col()
  const set: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.title !== undefined) set.title = patch.title
  if (patch.startAt !== undefined) {
    set.startAt = patch.startAt
    // Zaman değiştiyse hatırlatmayı yeniden armla.
    set.reminderSentAt = null
  }
  if (patch.whenText !== undefined) set.whenText = patch.whenText
  if (patch.durationMin !== undefined) set.durationMin = patch.durationMin
  if (patch.participants !== undefined) set.participants = patch.participants
  await c.updateOne({ _id: new ObjectId(id) }, { $set: set })
  return findById(id)
}

export async function cancel(id: string): Promise<ScheduledMeeting | null> {
  if (!ObjectId.isValid(id)) return null
  const c = await col()
  await c.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status: "cancelled", updatedAt: new Date() } },
  )
  return findById(id)
}

/**
 * T-15 hatırlatma için hazır toplantılar: scheduled, hatırlatma gönderilmemiş,
 * başlangıcı [now, now+windowMin] aralığında. Idempotent sweep bunları işler.
 */
export async function dueForReminder(windowMin = 15): Promise<ScheduledMeeting[]> {
  const c = await col()
  const now = new Date()
  const until = new Date(now.getTime() + windowMin * 60 * 1000)
  const docs = await c
    .find({
      status: "scheduled",
      reminderSentAt: null,
      startAt: { $gte: now, $lte: until },
    })
    .limit(200)
    .toArray()
  return docs.map((d) => toId(d) as ScheduledMeeting)
}

export async function markReminderSent(id: string): Promise<void> {
  if (!ObjectId.isValid(id)) return
  const c = await col()
  await c.updateOne({ _id: new ObjectId(id) }, { $set: { reminderSentAt: new Date() } })
}
