import { ObjectId } from "mongodb"

import { getDb } from "../client"
import { toId } from "./_helpers"

/**
 * Platform Web Push aboneliği — **user-scoped** (kullanıcı + tarayıcı-başına,
 * endpoint unique). Linear'ın company-scoped modelinden farklı: OS bildirim
 * toggle'ı kullanıcı tercihi ("tüm şirketlerimdeki mail'ler için bildir"), tek
 * abonelik. Dispatch anında hedef şirket mailbox→domain→company'den çözülür;
 * ilgili şirketin inbox-erişimli üyelerinin userId'leri bu koleksiyonda aranır.
 *
 * Yaşam döngüsü: aboneliğin VARLIĞI opt-in'dir; `enabled:false` cihaz-bazlı
 * sessize alma (uzaktan yönetilebilir — cihaz listesi ekranı). Kayıt,
 * kaydeden better-auth SESSION'ına bağlanır (`sessionToken`): oturum ölünce
 * (çıkış / revoke / süre dolumu) dispatch anında kayıt otomatik temizlenir —
 * çıkış yapmış cihaza push gitmez. Eski kayıtlar (sessionToken'sız) geçerli
 * sayılır (zero-migration).
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
  /** Transport. Yoksa (eski kayıtlar) `web` varsayılır — zero-migration.
   *  apns = iOS device token; fcm = Android FCM registration token. */
  platform?: "web" | "apns" | "fcm"
  /** Web push: abonelik public key (p256dh). APNs'te yok. */
  p256dh?: string
  /** Web push: abonelik auth secret. APNs'te yok. */
  auth?: string
  /** Bilgi amaçlı — hangi tarayıcı/cihaz (debug + cihaz listesi fallback'i). */
  userAgent?: string | null
  /** Kullanıcıya gösterilen cihaz adı (client bildirir; ör. "iOS 18.5"). */
  deviceName?: string | null
  /** Cihaz-bazlı sessize alma. Yoksa (eski kayıtlar) true varsayılır. */
  enabled?: boolean
  /** Kaydeden better-auth session'ının token'ı. Dispatch anında canlılığı
   *  doğrulanır; oturum yoksa kayıt purge edilir. null = legacy, hep canlı. */
  sessionToken?: string | null
  /** Son kayıt/yenileme zamanı (cihaz listesinde "son görülme"). */
  lastSeenAt?: Date
  createdAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

/** Cihaz devri kontrolü: aynı endpoint başka kullanıcıya geçiyorsa önceki
 *  sahibin cihaz-bazlı tercihi (enabled:false) YENİ sahibe taşınmamalı. */
async function resetEnabledIfOwnerChanged(endpoint: string, userId: string): Promise<void> {
  const c = await col()
  await c.updateOne(
    { endpoint, userId: { $ne: userId } },
    { $set: { enabled: true } },
  )
}

/** Aboneliği endpoint'e göre kaydet/güncelle (aynı tarayıcı tekrar abone olursa
 *  keys yenilenir, userId sahipliği güncellenir). `enabled` bilerek $set'te
 *  YOK — re-register kullanıcının cihaz tercihini ezmez. */
export async function upsertByEndpoint(data: {
  userId: string
  endpoint: string
  p256dh: string
  auth: string
  userAgent?: string | null
  deviceName?: string | null
  sessionToken?: string | null
}): Promise<void> {
  await resetEnabledIfOwnerChanged(data.endpoint, data.userId)
  const c = await col()
  await c.updateOne(
    { endpoint: data.endpoint },
    {
      $set: {
        userId: data.userId,
        p256dh: data.p256dh,
        auth: data.auth,
        userAgent: data.userAgent ?? null,
        ...(data.deviceName !== undefined ? { deviceName: data.deviceName } : {}),
        sessionToken: data.sessionToken ?? null,
        lastSeenAt: new Date(),
      },
      $setOnInsert: { endpoint: data.endpoint, enabled: true, createdAt: new Date() },
    },
    { upsert: true },
  )
}

/** Mobil cihaz token'ını kaydet/güncelle. `endpoint` = device/registration
 *  token; aynı token tekrar gelirse userId sahipliği güncellenir (cihaz devri).
 *  platform: apns (iOS) | fcm (Android). `enabled` $set'te YOK (tercih korunur). */
export async function upsertDevice(data: {
  userId: string
  deviceToken: string
  platform?: "apns" | "fcm"
  userAgent?: string | null
  deviceName?: string | null
  sessionToken?: string | null
}): Promise<void> {
  await resetEnabledIfOwnerChanged(data.deviceToken, data.userId)
  const c = await col()
  await c.updateOne(
    { endpoint: data.deviceToken },
    {
      $set: {
        userId: data.userId,
        platform: data.platform ?? "apns",
        userAgent: data.userAgent ?? null,
        ...(data.deviceName !== undefined ? { deviceName: data.deviceName } : {}),
        sessionToken: data.sessionToken ?? null,
        lastSeenAt: new Date(),
      },
      $setOnInsert: { endpoint: data.deviceToken, enabled: true, createdAt: new Date() },
    },
    { upsert: true },
  )
}

export async function deleteByEndpoint(endpoint: string): Promise<void> {
  const c = await col()
  await c.deleteOne({ endpoint })
}

/** Sahiplik-korumalı silme — yalnız kaydın sahibi endpoint'iyle silebilir
 *  (başka kullanıcının endpoint'ini öğrenen biri aboneliğini öldüremesin). */
export async function deleteByEndpointForUser(endpoint: string, userId: string): Promise<void> {
  const c = await col()
  await c.deleteOne({ endpoint, userId })
}

/** Kullanıcının cihaz listesi (cihaz yönetim ekranı). */
export async function listByUser(userId: string): Promise<PushSubscription[]> {
  const c = await col()
  const docs = await c.find({ userId }).sort({ lastSeenAt: -1, createdAt: -1 }).toArray()
  return docs.map(toId) as PushSubscription[]
}

/** Cihaz-bazlı bildirim aç/kapa — yalnız kendi kaydı. true = güncellendi. */
export async function setEnabledForUser(
  userId: string,
  id: string,
  enabled: boolean,
): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false
  const c = await col()
  const res = await c.updateOne(
    { _id: new ObjectId(id), userId },
    { $set: { enabled } },
  )
  return res.matchedCount > 0
}

/** Cihaz kaydını id ile sil — yalnız kendi kaydı. true = silindi. */
export async function deleteByIdForUser(userId: string, id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false
  const c = await col()
  const res = await c.deleteOne({ _id: new ObjectId(id), userId })
  return res.deletedCount > 0
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
