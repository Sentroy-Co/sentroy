import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "inbox_blocks"

/**
 * Inbox-level sender block — kullanıcı bir gönderiyi bloklar. Bu kayıt
 * "bu adres bloklu" gerçeğini tutar; fiili mail-server temizliği
 * `apps/mail/lib/inbox-block-purge.ts` tarafından yapılır.
 *
 * GÜVENLİK DAVRANIŞI (2026-06): Bloklanan göndericiden gelen mailler artık
 * yalnız UI'da gizlenmez — mail-server'dan KALICI silinir (block anında +
 * inbox listelenirken). Böylece okunmamış sayacında sayılmazlar. Bedeli:
 * block kaldırılınca o eski mailler geri GELMEZ. (Eski "sadece gizle"
 * davranışı operatörün açık güvenlik talebiyle değiştirildi.)
 *
 * Scope: company + (opsiyonel) mailbox. Mailbox boşsa company-wide
 * (tüm mailbox'lar için block). Dolu ise sadece o mailbox'ta filtrelenir.
 *
 * Not: Şu an sadece exact-match email block. Wildcard / domain-block
 * istenirse `pattern` alanı eklenir; şimdilik YAGNI.
 */
export interface InboxBlock {
  id: string
  companyId: string
  /** Bloklanan adres — lowercase normalize. */
  blockedEmail: string
  /** Hangi mailbox'a uygulanır — null ise company-wide. */
  mailbox: string | null
  /** Bilgi notu (UI'da kim niye blokladı). */
  reason?: string | null
  addedBy: string
  createdAt: Date
  updatedAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

function normalize(email: string): string {
  return email.trim().toLowerCase()
}

export async function findByCompany(companyId: string): Promise<InboxBlock[]> {
  const c = await col()
  const docs = await c
    .find({ companyId })
    .sort({ createdAt: -1 })
    .toArray()
  return docs.map(toId)
}

/**
 * Belirli bir mailbox için aktif bloklar — hem company-wide (mailbox=null)
 * hem de bu mailbox'a özel kayıtlar dahil. Caller sender filter için
 * lowercase Set'e koyar (`new Set(rows.map(r => r.blockedEmail))`).
 */
export async function findActiveForMailbox(
  companyId: string,
  mailbox: string,
): Promise<InboxBlock[]> {
  const c = await col()
  const docs = await c
    .find({
      companyId,
      $or: [{ mailbox: null }, { mailbox: mailbox.toLowerCase() }],
    })
    .toArray()
  return docs.map(toId)
}

export async function isBlocked(
  companyId: string,
  mailbox: string,
  fromEmail: string,
): Promise<boolean> {
  const c = await col()
  const doc = await c.findOne({
    companyId,
    blockedEmail: normalize(fromEmail),
    $or: [{ mailbox: null }, { mailbox: mailbox.toLowerCase() }],
  })
  return doc !== null
}

export async function block(payload: {
  companyId: string
  blockedEmail: string
  mailbox?: string | null
  reason?: string | null
  addedBy: string
}): Promise<InboxBlock> {
  const c = await col()
  const blockedEmail = normalize(payload.blockedEmail)
  const mailbox = payload.mailbox ? payload.mailbox.toLowerCase() : null
  const now = new Date()

  // Idempotent — aynı (companyId, blockedEmail, mailbox) varsa update.
  const existing = await c.findOne({
    companyId: payload.companyId,
    blockedEmail,
    mailbox,
  })
  if (existing) {
    await c.updateOne(
      { _id: existing._id },
      {
        $set: {
          reason: payload.reason ?? null,
          updatedAt: now,
        },
      },
    )
    return toId({ ...existing, reason: payload.reason ?? null, updatedAt: now })
  }

  const doc = {
    companyId: payload.companyId,
    blockedEmail,
    mailbox,
    reason: payload.reason ?? null,
    addedBy: payload.addedBy,
    createdAt: now,
    updatedAt: now,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

export async function unblock(
  id: string,
  companyId?: string,
): Promise<boolean> {
  const c = await col()
  // companyId verilirse scope'la (IDOR guard) — başka company'nin block'unu
  // _id tahminiyle silmek engellenir. companyId yoksa legacy davranış.
  const filter: Record<string, unknown> = { _id: toObjectId(id) }
  if (companyId) filter.companyId = companyId
  const result = await c.deleteOne(filter)
  return result.deletedCount === 1
}

export async function unblockByEmail(
  companyId: string,
  blockedEmail: string,
  mailbox?: string | null,
): Promise<number> {
  const c = await col()
  const result = await c.deleteMany({
    companyId,
    blockedEmail: normalize(blockedEmail),
    ...(mailbox !== undefined
      ? { mailbox: mailbox ? mailbox.toLowerCase() : null }
      : {}),
  })
  return result.deletedCount
}

export async function removeByCompany(companyId: string): Promise<number> {
  const c = await col()
  const result = await c.deleteMany({ companyId })
  return result.deletedCount
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  // Aynı (companyId, blockedEmail, mailbox) için tek kayıt.
  await c.createIndex(
    { companyId: 1, blockedEmail: 1, mailbox: 1 },
    { unique: true },
  )
  await c.createIndex({ companyId: 1, mailbox: 1 })
}
