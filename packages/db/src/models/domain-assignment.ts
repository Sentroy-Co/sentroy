import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "domain_assignments"

/**
 * System domain'in user-facing bir company'e atanmasını temsil eder.
 *
 * Senaryo: Admin Sentroy backend'de bir domain'i system company'nin API
 * key'i ile yarattı (örn `mail.sentroy.com`). Sonra bu domain'i user-tarafı
 * bir company'ye (örn `acme`) "ödünç" verir; acme üyeleri domain'i kendi
 * mailboxes/templates/inbox UI'larından yönetir, ama Sentroy backend'inde
 * domain hâlâ system'in (yani API key'in scope'u system company).
 *
 * Mail proxy katmanı bu mapping'e bakıp doğru sentroy client'ı seçer
 * (system key vs company key) — kullanıcıya transparan.
 *
 * NOT: SDK v1.0.13'te `domains.transfer` eklenirse bu mapping yine de
 * "kim hangi domain'i atadı, kim atadı" history kaydı için faydalı kalır;
 * key swap mantığı sadeleşir, ama assignment kaydı kalmaya devam eder.
 */
export interface DomainAssignment {
  id: string
  /** Sentroy backend domain id (uniq across system). */
  sentroyDomainId: string
  /** Cache for display — domain name (e.g. mail.example.com). Sentroy
   *  rename desteklemediği için stable; rename gelirse update gerek. */
  domainName: string
  /** Atama hedefi — user-facing company id. SYSTEM_COMPANY_SLUG'ı
   *  buraya yazmıyoruz (anlamsız self-loop). */
  ownerCompanyId: string
  /** Atamayı yapan admin user id (audit için). */
  assignedBy: string
  assignedAt: Date
  /** Re-assign history — bir önceki sahibin id'si. İlk atamada null. */
  previousOwnerCompanyId: string | null
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function findByDomainId(
  sentroyDomainId: string,
): Promise<DomainAssignment | null> {
  const c = await col()
  const doc = await c.findOne({ sentroyDomainId })
  return doc ? toId(doc) : null
}

export async function findByCompanyId(
  ownerCompanyId: string,
): Promise<DomainAssignment[]> {
  const c = await col()
  const docs = await c
    .find({ ownerCompanyId })
    .sort({ assignedAt: -1 })
    .toArray()
  return docs.map(toId)
}

export async function listAll(): Promise<DomainAssignment[]> {
  const c = await col()
  const docs = await c.find({}).sort({ assignedAt: -1 }).toArray()
  return docs.map(toId)
}

/**
 * Atamayı upsert eder. Aynı domain için tekrar çağırılırsa
 * `previousOwnerCompanyId` mevcut sahibe set edilir, sahip değişir.
 *
 * Atomic değil (find + update); paralel admin assign çağrılarında race
 * mümkün ama feature volume'u düşük (admin tek kişi). Sonradan single-doc
 * `findOneAndUpdate` ile sıkılaştırılabilir.
 */
export async function upsertAssignment(payload: {
  sentroyDomainId: string
  domainName: string
  ownerCompanyId: string
  assignedBy: string
}): Promise<DomainAssignment> {
  const c = await col()
  const existing = await findByDomainId(payload.sentroyDomainId)
  const now = new Date()

  if (existing) {
    await c.updateOne(
      { _id: toObjectId(existing.id) },
      {
        $set: {
          domainName: payload.domainName,
          ownerCompanyId: payload.ownerCompanyId,
          assignedBy: payload.assignedBy,
          assignedAt: now,
          previousOwnerCompanyId: existing.ownerCompanyId,
        },
      },
    )
    return {
      ...existing,
      domainName: payload.domainName,
      ownerCompanyId: payload.ownerCompanyId,
      assignedBy: payload.assignedBy,
      assignedAt: now,
      previousOwnerCompanyId: existing.ownerCompanyId,
    }
  }

  const doc = {
    sentroyDomainId: payload.sentroyDomainId,
    domainName: payload.domainName,
    ownerCompanyId: payload.ownerCompanyId,
    assignedBy: payload.assignedBy,
    assignedAt: now,
    previousOwnerCompanyId: null as string | null,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

export async function removeByDomainId(
  sentroyDomainId: string,
): Promise<boolean> {
  const c = await col()
  const result = await c.deleteOne({ sentroyDomainId })
  return result.deletedCount === 1
}

/**
 * Bir company silinince orphan kalan tüm assignment'ları temizler. Caller
 * silinen `companyId`'yi geçer; o company'e ait tüm row'lar düşer.
 *
 * Sentroy backend'de domain hâlâ system'in olduğu için domain kaybolmaz —
 * sadece "atanmamış" durumuna döner, admin sayfasında tekrar görünür.
 */
export async function removeByCompanyId(
  ownerCompanyId: string,
): Promise<number> {
  const c = await col()
  const result = await c.deleteMany({ ownerCompanyId })
  return result.deletedCount
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ sentroyDomainId: 1 }, { unique: true })
  await c.createIndex({ ownerCompanyId: 1 })
}
