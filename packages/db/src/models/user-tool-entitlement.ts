import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"
import type { UserToolEntitlement } from "../types/user-tool-entitlement"

const COLLECTION = "user_tool_entitlements"

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function create(data: {
  userId: string
  toolKey: string
  packKey: string
  polarOrderId: string
  polarProductId?: string | null
  total: number
  priceUsd: number
  validityDays: number
}): Promise<UserToolEntitlement> {
  const c = await col()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + data.validityDays * 24 * 60 * 60 * 1000)
  const doc = {
    userId: data.userId,
    toolKey: data.toolKey,
    packKey: data.packKey,
    polarOrderId: data.polarOrderId,
    polarProductId: data.polarProductId ?? null,
    total: data.total,
    remaining: data.total,
    priceUsd: data.priceUsd,
    createdAt: now,
    expiresAt,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

/** Idempotency — bu Polar order için entitlement zaten yaratıldı mı. */
export async function findByOrderId(
  polarOrderId: string,
): Promise<UserToolEntitlement | null> {
  const c = await col()
  return toId(await c.findOne({ polarOrderId })) as UserToolEntitlement | null
}

/** Bir aracın aktif (süresi geçmemiş, kredi kalan) hakları — yakın bitenden başa. */
export async function findActive(
  userId: string,
  toolKey: string,
): Promise<UserToolEntitlement[]> {
  const c = await col()
  const docs = await c
    .find({ userId, toolKey, remaining: { $gt: 0 }, expiresAt: { $gt: new Date() } })
    .sort({ expiresAt: 1 })
    .toArray()
  return docs.map(toId) as UserToolEntitlement[]
}

/** Bir araç için kullanıcının toplam aktif kalan kredisi. */
export async function activeRemaining(
  userId: string,
  toolKey: string,
): Promise<number> {
  const list = await findActive(userId, toolKey)
  return list.reduce((sum, e) => sum + e.remaining, 0)
}

/** Kullanıcının tüm hakları ("satın alımlarım" ekranı için), yeniden eskiye. */
export async function findByUser(userId: string): Promise<UserToolEntitlement[]> {
  const c = await col()
  const docs = await c.find({ userId }).sort({ createdAt: -1 }).toArray()
  return docs.map(toId) as UserToolEntitlement[]
}

/**
 * Tek bir entitlement'tan `n` kredi atomik tüket. Filtre `remaining >= n` ve
 * `expiresAt > now` → yarış koşulunda çifte tüketim olmaz; yeterli kredi/süre
 * yoksa null döner (çağıran bir sonraki aktif hakka geçer).
 */
export async function consumeCredit(
  id: string,
  n: number,
): Promise<UserToolEntitlement | null> {
  const c = await col()
  const res = await c.findOneAndUpdate(
    { _id: toObjectId(id), remaining: { $gte: n }, expiresAt: { $gt: new Date() } },
    { $inc: { remaining: -n } },
    { returnDocument: "after" },
  )
  return toId(res) as UserToolEntitlement | null
}

/**
 * Bir araçtan `n` kredi düş — aktif hakları yakın bitenden başlayarak gez,
 * gerekirse birden fazla hakka böl. Yeterli toplam kredi yoksa false döner
 * (tüketim atomik tek-hak bazında; kısmi tüketim olmaması için önce
 * activeRemaining ile kontrol et).
 */
export async function consumeForTool(
  userId: string,
  toolKey: string,
  n: number,
): Promise<boolean> {
  let need = n
  const active = await findActive(userId, toolKey)
  for (const e of active) {
    if (need <= 0) break
    const take = Math.min(e.remaining, need)
    const updated = await consumeCredit(e.id, take)
    if (updated) need -= take
  }
  return need <= 0
}

/**
 * Kredi iadesi — provider siparişi başarısız olursa önce tüketilen krediyi geri
 * ver. `remaining`'i `total`'i aşmayacak şekilde artırır (güvenlik).
 */
export async function refundCredit(id: string, n: number): Promise<void> {
  const c = await col()
  const ent = toId(await c.findOne({ _id: toObjectId(id) })) as UserToolEntitlement | null
  if (!ent) return
  const next = Math.min(ent.total, ent.remaining + n)
  await c.updateOne({ _id: toObjectId(id) }, { $set: { remaining: next } })
}

/** 45 gün dolmuş hakları temizle (cron/lazy). */
export async function deleteExpired(): Promise<number> {
  const c = await col()
  const res = await c.deleteMany({ expiresAt: { $lte: new Date() } })
  return res.deletedCount
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ userId: 1, toolKey: 1 })
  await c.createIndex({ polarOrderId: 1 }, { unique: true })
  await c.createIndex({ expiresAt: 1 })
  await c.createIndex({ createdAt: -1 })
}
