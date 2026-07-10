import { getDb } from "../client"
import { toId } from "./_helpers"

/**
 * WhatsApp Santral — bir oturumdaki (numaranın) sohbet/kişi kaydı.
 * `(companyId, sessionId)` ile scope'lanır (çoklu numara). Bkz.
 * [[whatsapp-session]].
 */

const COLLECTION = "whatsapp_contacts"

export interface WhatsappContact {
  id: string
  companyId: string
  sessionId: string
  jid: string
  phone: string | null
  name: string | null
  pushName: string | null
  /** UI'dan kullanıcı tarafından verilen isim — WhatsApp adını override eder. */
  customName: string | null
  isGroup: boolean
  /** WhatsApp profil foto URL'i (CDN; expire olabilir → UI'da onError fallback). */
  avatarUrl: string | null
  /** Profil foto en son ne zaman çekildi (tekrar-fetch'i sınırlamak için). */
  avatarFetchedAt: Date | null
  archived: boolean
  pinned: boolean
  lastMessageAt: Date | null
  lastMessagePreview: string | null
  lastMessageFromMe: boolean
  unreadCount: number
  createdAt: Date
  updatedAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function upsertByJid(
  companyId: string,
  sessionId: string,
  jid: string,
  patch: {
    phone?: string | null
    name?: string | null
    pushName?: string | null
    isGroup?: boolean
    avatarUrl?: string | null
    avatarFetchedAt?: Date | null
    lastMessageAt?: Date | null
    lastMessagePreview?: string | null
    lastMessageFromMe?: boolean
    incrementUnread?: boolean
  },
): Promise<WhatsappContact> {
  const c = await col()
  const now = new Date()
  const set: Record<string, unknown> = { updatedAt: now }
  if (patch.phone !== undefined) set.phone = patch.phone
  if (patch.name !== undefined) set.name = patch.name
  if (patch.pushName !== undefined) set.pushName = patch.pushName
  if (patch.isGroup !== undefined) set.isGroup = patch.isGroup
  if (patch.avatarUrl !== undefined) set.avatarUrl = patch.avatarUrl
  if (patch.avatarFetchedAt !== undefined)
    set.avatarFetchedAt = patch.avatarFetchedAt
  if (patch.lastMessageAt !== undefined) set.lastMessageAt = patch.lastMessageAt
  if (patch.lastMessagePreview !== undefined)
    set.lastMessagePreview = patch.lastMessagePreview
  if (patch.lastMessageFromMe !== undefined)
    set.lastMessageFromMe = patch.lastMessageFromMe

  const update: Record<string, unknown> = {
    $set: set,
    $setOnInsert: {
      companyId,
      sessionId,
      jid,
      archived: false,
      pinned: false,
      customName: null,
      avatarUrl: patch.avatarUrl === undefined ? null : undefined,
      avatarFetchedAt: patch.avatarFetchedAt === undefined ? null : undefined,
      createdAt: now,
    },
  }
  // $set ve $setOnInsert aynı alanı içeremez — avatar patch'te varsa
  // setOnInsert'ten çıkar.
  const soi = update.$setOnInsert as Record<string, unknown>
  if (soi.avatarUrl === undefined) delete soi.avatarUrl
  if (soi.avatarFetchedAt === undefined) delete soi.avatarFetchedAt

  if (patch.incrementUnread) {
    update.$inc = { unreadCount: 1 }
  } else {
    soi.unreadCount = 0
  }

  const result = await c.findOneAndUpdate(
    { companyId, sessionId, jid },
    update,
    { upsert: true, returnDocument: "after" },
  )
  return toId(result)
}

export async function findBySession(
  companyId: string,
  sessionId: string,
  opts?: {
    q?: string
    limit?: number
    skip?: number
    includeArchived?: boolean
  },
): Promise<WhatsappContact[]> {
  const c = await col()
  // Liste yalnız gerçek sohbetleri gösterir (mesajı olanlar). İsim
  // zenginleştirme için oluşturulan konuşmasız (lastMessageAt=null) kayıtlar
  // gizlenir — aksi halde tüm rehber listeye dolardı.
  const filter: Record<string, unknown> = {
    companyId,
    sessionId,
    lastMessageAt: { $ne: null },
  }
  if (!opts?.includeArchived) filter.archived = { $ne: true }
  if (opts?.q?.trim()) {
    const escaped = opts.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    // Arama modunda arşivli sohbetler de gelsin (kullanıcı bilerek arıyor).
    delete filter.archived
    filter.$or = [
      { name: { $regex: escaped, $options: "i" } },
      { pushName: { $regex: escaped, $options: "i" } },
      { phone: { $regex: escaped, $options: "i" } },
    ]
  }
  let cursor = c
    .find(filter)
    .sort({ pinned: -1, lastMessageAt: -1, updatedAt: -1 })
  if (opts?.skip) cursor = cursor.skip(opts.skip)
  cursor = cursor.limit(Math.min(opts?.limit ?? 100, 300))
  const docs = await cursor.toArray()
  return docs.map(toId)
}

export async function findByJid(
  companyId: string,
  sessionId: string,
  jid: string,
): Promise<WhatsappContact | null> {
  const c = await col()
  return toId(await c.findOne({ companyId, sessionId, jid }))
}

/** Birden çok jid'i tek sorguda — mesaj arama sonuçlarını adlandırmak için. */
export async function findByJids(
  companyId: string,
  sessionId: string,
  jids: string[],
): Promise<WhatsappContact[]> {
  if (jids.length === 0) return []
  const c = await col()
  const docs = await c
    .find({ companyId, sessionId, jid: { $in: jids } })
    .toArray()
  return docs.map(toId)
}

/**
 * Sohbetin son-mesaj özetini YALNIZCA gelen mesaj daha yeniyse günceller.
 * Geçmiş senkronu (newest-first) sırasında eski mesajların son-mesajı geri
 * götürmesini engeller. Kişi yoksa önce var olduğundan emin ol (upsertByJid).
 */
export async function setLastMessageIfNewer(
  companyId: string,
  sessionId: string,
  jid: string,
  data: { at: Date; preview: string; fromMe: boolean },
): Promise<void> {
  const c = await col()
  await c.updateOne(
    {
      companyId,
      sessionId,
      jid,
      $or: [{ lastMessageAt: null }, { lastMessageAt: { $lt: data.at } }],
    },
    {
      $set: {
        lastMessageAt: data.at,
        lastMessagePreview: data.preview,
        lastMessageFromMe: data.fromMe,
        updatedAt: new Date(),
      },
    },
  )
}

export async function resetUnread(
  companyId: string,
  sessionId: string,
  jid: string,
): Promise<void> {
  const c = await col()
  await c.updateOne(
    { companyId, sessionId, jid },
    { $set: { unreadCount: 0, updatedAt: new Date() } },
  )
}

export async function setFlags(
  companyId: string,
  sessionId: string,
  jid: string,
  flags: { archived?: boolean; pinned?: boolean },
): Promise<WhatsappContact | null> {
  const c = await col()
  const set: Record<string, unknown> = { updatedAt: new Date() }
  if (flags.archived !== undefined) set.archived = flags.archived
  if (flags.pinned !== undefined) set.pinned = flags.pinned
  const result = await c.findOneAndUpdate(
    { companyId, sessionId, jid },
    { $set: set },
    { returnDocument: "after" },
  )
  return toId(result)
}

/**
 * İsim/pushName günceller — YALNIZCA sohbet zaten varsa (upsert YOK).
 * Rehber/contacts senkronunun, konuşması olmayan kişileri listeye eklemesini
 * engeller; sadece mevcut sohbetlerin adını zenginleştirir. Döner: eşleşti mi.
 */
export async function updateNames(
  companyId: string,
  sessionId: string,
  jid: string,
  data: { name?: string | null; pushName?: string | null },
): Promise<boolean> {
  const c = await col()
  const set: Record<string, unknown> = { updatedAt: new Date() }
  if (data.name !== undefined && data.name !== null) set.name = data.name
  if (data.pushName !== undefined && data.pushName !== null)
    set.pushName = data.pushName
  if (Object.keys(set).length === 1) return false // sadece updatedAt → atla
  const r = await c.updateOne({ companyId, sessionId, jid }, { $set: set })
  return r.matchedCount > 0
}

/** UI'dan verilen özel ismi ayarla/temizle (boş string → null). */
export async function setCustomName(
  companyId: string,
  sessionId: string,
  jid: string,
  customName: string | null,
): Promise<WhatsappContact | null> {
  const c = await col()
  const result = await c.findOneAndUpdate(
    { companyId, sessionId, jid },
    { $set: { customName: customName || null, updatedAt: new Date() } },
    { returnDocument: "after" },
  )
  return toId(result)
}

export async function setAvatar(
  companyId: string,
  sessionId: string,
  jid: string,
  avatarUrl: string | null,
): Promise<void> {
  const c = await col()
  await c.updateOne(
    { companyId, sessionId, jid },
    { $set: { avatarUrl, avatarFetchedAt: new Date() } },
  )
}

export async function deleteChat(
  companyId: string,
  sessionId: string,
  jid: string,
): Promise<void> {
  const c = await col()
  await c.deleteOne({ companyId, sessionId, jid })
}

export async function deleteBySession(
  companyId: string,
  sessionId: string,
): Promise<void> {
  const c = await col()
  await c.deleteMany({ companyId, sessionId })
}

export async function deleteByCompany(companyId: string): Promise<void> {
  const c = await col()
  await c.deleteMany({ companyId })
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ companyId: 1, sessionId: 1, jid: 1 }, { unique: true })
  await c.createIndex({ companyId: 1, sessionId: 1, pinned: -1, lastMessageAt: -1 })
}
