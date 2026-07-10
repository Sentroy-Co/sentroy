import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "catch_all_rules"

/**
 * Bir domain için "tüm `*@domain.com` mailleri tek bir mailbox'a yönlendir"
 * kuralı. Domain başına en fazla bir aktif rule (unique index ile garanti).
 *
 * Backend bağımlılığı: gerçek delivery Sentroy mail server'ında catch-all
 * desteği gerektirir. SDK v1.0.12'de yok; v1.0.13'te
 * `domains.setCatchAll(domainId, mailboxEmail)` eklenecek (RFI-3, bkz.
 * `docs/sdk-update-v1.0.13.md`). Bu DB kaydı backend'in source-of-truth'una
 * eşlik eder; ikisinden biri deviated olursa rule disabled gibi davranır.
 */
export interface CatchAllRule {
  id: string
  /** Hangi company'ye ait (assigned domain'lerde de hedef company id). */
  companyId: string
  /** Sentroy backend domain id. */
  sentroyDomainId: string
  /** Cache for display — domain name. */
  domainName: string
  /** Routing target — gerçek bir mailbox email'i (örn `inbox@example.com`). */
  targetMailboxEmail: string
  /** Sentroy mailbox doc id (varsa cache; create flow'da set edilir). */
  targetMailboxId: string | null
  /** Geçici disable için flag — silmeden devre dışı bırakmak isteyen
   *  kullanıcı için. Disable iken backend tarafında catch-all kaldırılır
   *  ama DB kaydı kalır (UX: re-enable ile aynı target). */
  enabled: boolean
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function findByDomainId(
  sentroyDomainId: string,
): Promise<CatchAllRule | null> {
  const c = await col()
  const doc = await c.findOne({ sentroyDomainId })
  return doc ? toId(doc) : null
}

export async function findByCompanyId(
  companyId: string,
): Promise<CatchAllRule[]> {
  const c = await col()
  const docs = await c
    .find({ companyId })
    .sort({ createdAt: -1 })
    .toArray()
  return docs.map(toId)
}

/**
 * Mailbox listesi join'i için bulk lookup — bir company'nin tüm mailbox
 * email'lerinin hangi'sinin catch-all olduğunu işaretlemek üzere. Rule
 * disabled ise döner ama caller `enabled` flag'ini kontrol etmeli.
 */
export async function findActiveByCompanyId(
  companyId: string,
): Promise<CatchAllRule[]> {
  const c = await col()
  const docs = await c.find({ companyId, enabled: true }).toArray()
  return docs.map(toId)
}

export async function upsertRule(payload: {
  companyId: string
  sentroyDomainId: string
  domainName: string
  targetMailboxEmail: string
  targetMailboxId: string | null
  createdBy: string
}): Promise<CatchAllRule> {
  const c = await col()
  const existing = await findByDomainId(payload.sentroyDomainId)
  const now = new Date()

  if (existing) {
    await c.updateOne(
      { _id: toObjectId(existing.id) },
      {
        $set: {
          companyId: payload.companyId,
          domainName: payload.domainName,
          targetMailboxEmail: payload.targetMailboxEmail,
          targetMailboxId: payload.targetMailboxId,
          enabled: true,
          updatedAt: now,
        },
      },
    )
    return {
      ...existing,
      companyId: payload.companyId,
      domainName: payload.domainName,
      targetMailboxEmail: payload.targetMailboxEmail,
      targetMailboxId: payload.targetMailboxId,
      enabled: true,
      updatedAt: now,
    }
  }

  const doc = {
    companyId: payload.companyId,
    sentroyDomainId: payload.sentroyDomainId,
    domainName: payload.domainName,
    targetMailboxEmail: payload.targetMailboxEmail,
    targetMailboxId: payload.targetMailboxId,
    enabled: true,
    createdBy: payload.createdBy,
    createdAt: now,
    updatedAt: now,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

export async function setEnabled(
  sentroyDomainId: string,
  enabled: boolean,
): Promise<boolean> {
  const c = await col()
  const result = await c.updateOne(
    { sentroyDomainId },
    { $set: { enabled, updatedAt: new Date() } },
  )
  return result.matchedCount === 1
}

export async function removeByDomainId(
  sentroyDomainId: string,
): Promise<boolean> {
  const c = await col()
  const result = await c.deleteOne({ sentroyDomainId })
  return result.deletedCount === 1
}

export async function removeByCompanyId(companyId: string): Promise<number> {
  const c = await col()
  const result = await c.deleteMany({ companyId })
  return result.deletedCount
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ sentroyDomainId: 1 }, { unique: true })
  await c.createIndex({ companyId: 1 })
}
