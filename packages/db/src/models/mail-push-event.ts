import { getDb } from "../client"
import { toId } from "./_helpers"

/**
 * Ephemeral "yeni mail geldi" sinyali — Electron masaüstü uygulamasının
 * poll'ladığı kısa-ömürlü kanal. Tarayıcıda yeni mail bildirimi VAPID Web
 * Push ile gelir; Electron'un Chromium'unda push service olmadığından VAPID
 * çalışmaz. Bunun yerine mail-push (mail-server → core) her yeni mail için
 * buraya bir kayıt atar; OS sayfası (Electron) `/api/push/recent`'i poll'layıp
 * native `new Notification` gösterir. TTL index kayıtları 10 dk sonra siler →
 * bildirim merkezini (user_notifications) şişirmez, koleksiyon büyümez.
 */
const COLLECTION = "mail_push_events"

export interface MailPushEvent {
  id: string
  userId: string
  from: string | null
  subject: string | null
  url: string
  mailbox: string
  createdAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

// Core (Next.js) startup'ta createIndexes çağrılmıyor → TTL index'i ilk
// create'te (process başına bir kez) idempotent kur, aksi halde koleksiyon
// süresiz büyür.
let indexed: Promise<void> | null = null
function ensureIndexed(): Promise<void> {
  if (!indexed) indexed = createIndexes().catch(() => {})
  return indexed
}

export async function create(data: {
  userId: string
  from: string | null
  subject: string | null
  url: string
  mailbox: string
}): Promise<void> {
  await ensureIndexed()
  const c = await col()
  await c.insertOne({ ...data, createdAt: new Date() })
}

/** Verilen zaman damgasından (ms) sonra oluşan olaylar (poll için). */
export async function findRecentForUser(
  userId: string,
  sinceMs: number,
): Promise<MailPushEvent[]> {
  const c = await col()
  const docs = await c
    .find({ userId, createdAt: { $gt: new Date(sinceMs) } })
    .sort({ createdAt: 1 })
    .limit(20)
    .toArray()
  return docs.map(toId) as MailPushEvent[]
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ userId: 1, createdAt: -1 })
  // TTL — 10 dk sonra otomatik sil (poll aralığından çok uzun, kaçırma yok).
  await c.createIndex({ createdAt: 1 }, { expireAfterSeconds: 600 })
}
