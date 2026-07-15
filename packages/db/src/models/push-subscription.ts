import { getDb } from "../client"
import { toId } from "./_helpers"

/**
 * Platform Web Push aboneliği — **user-scoped** (kullanıcı + tarayıcı-başına,
 * endpoint unique). Linear'ın company-scoped modelinden farklı: OS bildirim
 * toggle'ı kullanıcı tercihi ("tüm şirketlerimdeki mail'ler için bildir"), tek
 * abonelik. Dispatch anında hedef şirket mailbox→domain→company'den çözülür;
 * ilgili şirketin inbox-erişimli üyelerinin userId'leri bu koleksiyonda aranır.
 *
 * Aboneliğin VARLIĞI = opt-in. Toggle kapatınca kayıt silinir = opt-out.
 * Ayrı bir "enabled" bayrağı tutmayız (YAGNI).
 */
const COLLECTION = "push_subscriptions"

export interface PushSubscription {
  id: string
  /** Sentroy kullanıcı id'si (better-auth user). */
  userId: string
  /**
   * Benzersiz abonelik kimliği. Web push → tarayıcı push endpoint URL'i;
   * APNs (mobil) → hex device token. Tek `endpoint` unique index'i ikisini de
   * kapsar (aynı token/endpoint tek kayıt).
   */
  endpoint: string
  /** Transport. Yoksa (eski kayıtlar) `web` varsayılır — zero-migration. */
  platform?: "web" | "apns"
  /** Web push: abonelik public key (p256dh). APNs'te yok. */
  p256dh?: string
  /** Web push: abonelik auth secret. APNs'te yok. */
  auth?: string
  /** Bilgi amaçlı — hangi tarayıcı/cihaz (debug + ileride cihaz listesi). */
  userAgent?: string | null
  createdAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

/** Aboneliği endpoint'e göre kaydet/güncelle (aynı tarayıcı tekrar abone olursa
 *  keys yenilenir, userId sahipliği güncellenir). */
export async function upsertByEndpoint(data: {
  userId: string
  endpoint: string
  p256dh: string
  auth: string
  userAgent?: string | null
}): Promise<void> {
  const c = await col()
  await c.updateOne(
    { endpoint: data.endpoint },
    {
      $set: {
        userId: data.userId,
        p256dh: data.p256dh,
        auth: data.auth,
        userAgent: data.userAgent ?? null,
      },
      $setOnInsert: { endpoint: data.endpoint, createdAt: new Date() },
    },
    { upsert: true },
  )
}

/** APNs (mobil) cihaz token'ını kaydet/güncelle. `endpoint` = device token;
 *  aynı token tekrar gelirse userId sahipliği güncellenir (cihaz devri). */
export async function upsertDevice(data: {
  userId: string
  deviceToken: string
  userAgent?: string | null
}): Promise<void> {
  const c = await col()
  await c.updateOne(
    { endpoint: data.deviceToken },
    {
      $set: {
        userId: data.userId,
        platform: "apns",
        userAgent: data.userAgent ?? null,
      },
      $setOnInsert: { endpoint: data.deviceToken, createdAt: new Date() },
    },
    { upsert: true },
  )
}

export async function deleteByEndpoint(endpoint: string): Promise<void> {
  const c = await col()
  await c.deleteOne({ endpoint })
}

/** Verilen kullanıcı id'lerine ait tüm abonelikler (dispatch hedefi). */
export async function findByUsers(
  userIds: string[],
): Promise<PushSubscription[]> {
  if (userIds.length === 0) return []
  const c = await col()
  const docs = await c.find({ userId: { $in: userIds } }).toArray()
  return docs.map(toId) as PushSubscription[]
}

/** Tek kullanıcının abonelikleri — kullanıcı push'u açık mı kontrolü için. */
export async function findByUser(
  userId: string,
): Promise<PushSubscription[]> {
  const c = await col()
  const docs = await c.find({ userId }).toArray()
  return docs.map(toId) as PushSubscription[]
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ endpoint: 1 }, { unique: true })
  await c.createIndex({ userId: 1 })
}
