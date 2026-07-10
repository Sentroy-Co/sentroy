import { getDb } from "../client"
import type { Company, CompanySubscription, Plan } from "../types"
import { WHATSAPP_LIMIT_DEFAULTS } from "../types/plan"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "companies"

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function findBySlug(slug: string): Promise<Company | null> {
  const c = await col()
  const doc = await c.findOne({ slug })
  return toId(doc)
}

export async function findById(id: string): Promise<Company | null> {
  const c = await col()
  const doc = await c.findOne({ _id: toObjectId(id) })
  return toId(doc)
}

export async function findByOwnerId(ownerId: string): Promise<Company[]> {
  const c = await col()
  const docs = await c.find({ ownerId }).toArray()
  return docs.map(toId)
}

/**
 * Admin-only: tüm company'leri listeler. Filter caller'da
 * (`__system` shadow'u hariç tutmak gibi). Sıralama: alfabetik isim,
 * UI picker dropdown davranışına uygun.
 */
export async function findAll(): Promise<Company[]> {
  const c = await col()
  const docs = await c.find({}).sort({ name: 1 }).toArray()
  return docs.map(toId)
}

export async function create(
  data: Omit<Company, "id" | "createdAt" | "updatedAt">,
): Promise<Company> {
  const c = await col()
  const now = new Date()
  const result = await c.insertOne({
    ...data,
    createdAt: now,
    updatedAt: now,
  })
  return {
    id: result.insertedId.toString(),
    ...data,
    createdAt: now,
    updatedAt: now,
  }
}

export async function updateById(
  id: string,
  data: Partial<Company>,
): Promise<Company | null> {
  const c = await col()
  const { id: _ignoreId, ...updateData } = data as any
  const result = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    { $set: { ...updateData, updatedAt: new Date() } },
    { returnDocument: "after" },
  )
  return toId(result)
}

export async function deleteById(id: string): Promise<boolean> {
  const c = await col()
  const result = await c.deleteOne({ _id: toObjectId(id) })
  return result.deletedCount === 1
}

/**
 * Aylık gönderim sayacını atomik olarak artır. Send route başarılı her
 * gönderim sonrasında çağırır (single = 1, batch = recipients.length).
 *
 * Aylık reset: ayrı bir cron / job ile period değişiminde 0'a çekilir;
 * bu fonksiyon sadece monoton artırma yapar — doğru periyot içinde mi
 * kontrolü caller'da.
 */
export async function findByPolarCustomerId(
  polarCustomerId: string,
): Promise<Company | null> {
  const c = await col()
  const doc = await c.findOne({ polarCustomerId })
  return toId(doc)
}

/**
 * Plan limitlerini company'ye denormalize uygula. `planId` + tüm limit
 * alanları plan objesinden kopyalanır (company creation'daki eşlemenin
 * aynısı — bkz. apps/core/app/api/companies/route.ts). Abonelik
 * aktif/değiştiğinde planı yükseltmek, iptal/revoke'da default(Free) plana
 * düşürmek için çağrılır. `mailStorageUsed` / `monthlyEmailsSent` sayaçlarına
 * dokunmaz.
 */
export async function applyPlan(
  companyId: string,
  plan: Plan,
): Promise<void> {
  const c = await col()
  await c.updateOne(
    { _id: toObjectId(companyId) },
    {
      $set: {
        planId: plan.id,
        mailStorageLimit: plan.storageLimit,
        maxDomains: plan.maxDomainsPerCompany,
        maxMembers: plan.maxMembersPerCompany,
        maxMailboxes: plan.maxMailboxesPerCompany,
        maxContacts: plan.maxContacts,
        trashRetentionDays: plan.trashRetentionDays,
        monthlyEmailLimit: plan.monthlyEmailLimit,
        maxWhatsappNumbers:
          plan.maxWhatsappNumbers ?? WHATSAPP_LIMIT_DEFAULTS.maxNumbers,
        maxWhatsappTemplates:
          plan.maxWhatsappTemplates ?? WHATSAPP_LIMIT_DEFAULTS.maxTemplates,
        monthlyWhatsappLimit:
          plan.monthlyWhatsappLimit ?? WHATSAPP_LIMIT_DEFAULTS.monthlySends,
        updatedAt: new Date(),
      },
    },
  )
}

/** Polar abonelik kaydını set/temizle (null → aboneliği kaldırır). */
export async function setSubscription(
  companyId: string,
  subscription: CompanySubscription | null,
): Promise<void> {
  const c = await col()
  await c.updateOne(
    { _id: toObjectId(companyId) },
    { $set: { subscription, updatedAt: new Date() } },
  )
}

/** Polar customer ID'yi kaydet (ilk checkout / webhook'ta). */
export async function setPolarCustomerId(
  companyId: string,
  polarCustomerId: string,
): Promise<void> {
  const c = await col()
  await c.updateOne(
    { _id: toObjectId(companyId) },
    { $set: { polarCustomerId, updatedAt: new Date() } },
  )
}

export async function incrementEmailsSent(
  id: string,
  by: number,
): Promise<void> {
  if (by <= 0) return
  const c = await col()
  await c.updateOne(
    { _id: toObjectId(id) },
    {
      $inc: { monthlyEmailsSent: by },
      $set: { updatedAt: new Date() },
    },
  )
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ slug: 1 }, { unique: true })
  await c.createIndex({ ownerId: 1 })
  await c.createIndex(
    { polarCustomerId: 1 },
    { sparse: true },
  )
  await c.createIndex(
    { "subscription.polarSubscriptionId": 1 },
    { sparse: true },
  )
}
