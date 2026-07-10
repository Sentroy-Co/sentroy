import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "user_notifications"

/**
 * Persisted, server-side in-app bildirimler. Mevcut zustand store
 * (packages/console/src/stores/notifications.ts) sadece client-side ve
 * runtime'da kayboluyor — bu koleksiyon "yanı tarafa açıldığımda da
 * görmek isterim" deneyimini sağlar. Notification'lar user-scoped (her
 * cihazda aynı kullanıcı için aynı liste); company-scoped meta varsa
 * `meta.companyId` payload içinde tutulur.
 *
 * `type` semantik bir slug — bildirim ikonunu/route'unu UI'da map'lemek
 * için. Yeni türler eklemek migration gerektirmez.
 */
export type NotificationType =
  | "company-invitation"
  | "company-member-joined"
  | "company-member-removed"
  | "linear"
  | "system"

export interface UserNotification {
  id: string
  /** Alıcı user id (better-auth user._id). */
  userId: string
  type: NotificationType
  title: string
  /** Opsiyonel kısa açıklama; UI'da second line. */
  body?: string
  /** Tıklandığında gidilecek path (locale prefix'siz; UI mevcut locale'i ekler). */
  href?: string
  /** Bildirime özgü ek alan; type'a göre interpret edilir. */
  meta?: Record<string, unknown>
  read: boolean
  readAt?: Date | null
  createdAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function listForUser(
  userId: string,
  opts: { limit?: number; onlyUnread?: boolean } = {},
): Promise<UserNotification[]> {
  const c = await col()
  const filter: Record<string, unknown> = { userId }
  if (opts.onlyUnread) filter.read = false
  const docs = await c
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(opts.limit ?? 50)
    .toArray()
  return docs.map(toId) as UserNotification[]
}

export async function countUnread(userId: string): Promise<number> {
  const c = await col()
  return c.countDocuments({ userId, read: false })
}

export async function create(data: {
  userId: string
  type: NotificationType
  title: string
  body?: string
  href?: string
  meta?: Record<string, unknown>
}): Promise<UserNotification> {
  const c = await col()
  const now = new Date()
  const doc = {
    userId: data.userId,
    type: data.type,
    title: data.title,
    body: data.body ?? null,
    href: data.href ?? null,
    meta: data.meta ?? null,
    read: false,
    readAt: null,
    createdAt: now,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc } as UserNotification
}

export async function markRead(
  userId: string,
  notificationId: string,
): Promise<boolean> {
  const c = await col()
  const result = await c.updateOne(
    { _id: toObjectId(notificationId), userId },
    { $set: { read: true, readAt: new Date() } },
  )
  return result.modifiedCount === 1
}

export async function markAllRead(userId: string): Promise<number> {
  const c = await col()
  const result = await c.updateMany(
    { userId, read: false },
    { $set: { read: true, readAt: new Date() } },
  )
  return result.modifiedCount
}

export async function deleteById(
  userId: string,
  notificationId: string,
): Promise<boolean> {
  const c = await col()
  const result = await c.deleteOne({
    _id: toObjectId(notificationId),
    userId,
  })
  return result.deletedCount === 1
}
