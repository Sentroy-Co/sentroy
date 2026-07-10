import { getDb } from "../client"
import { toId } from "./_helpers"

const COLLECTION = "mail_template_sources"

type LocalizedString = string | Record<string, string>

/**
 * Editor'de yazılan ham içeriğin "source of truth" kopyası. Sentroy
 * mail-server template'leri kendi tarafında saklar ama olası
 * normalization (HTML sanitize, MJML compile, whitespace strip vs.)
 * round-trip kaybına yol açabilir — kullanıcı bir kez kaydedip yeniden
 * açtığında orijinal yazdığını görmek ister.
 *
 * List/get cevabı bu koleksiyondan enrich edilir; varsa name/subject/body
 * sentroy'dan değil burayı override eder. Editor için artık kayıt
 * idempotent: "yazdığımı sonra göreceğim" sözleşmesi.
 */
export interface MailTemplateSource {
  id: string
  companyId: string
  templateId: string
  name: LocalizedString
  subject: LocalizedString
  body: LocalizedString
  /** Library'den clone edildiyse kaynak system template id. Standalone create'de null. */
  sourceSystemTemplateId?: string | null
  /** Source template'in koleksiyonu — UI'da grouping/badge için. */
  sourceCollectionId?: string | null
  /** Source kategorisi — clone edilen template'in kategorik bilgisi (badge). */
  category?: string | null
  createdAt: Date
  updatedAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function findByTemplate(
  companyId: string,
  templateId: string,
): Promise<MailTemplateSource | null> {
  const c = await col()
  const doc = await c.findOne({ companyId, templateId })
  return toId(doc) as MailTemplateSource | null
}

/**
 * Cross-company list — admin tarafı için (system mail event editor'inde
 * referans alacağı template gallery). Sıralama updatedAt desc; client
 * gereken filter'ı (örn arama) ekrandan uygular. Limit safety net olarak
 * 500 — daha fazlası için lazy paginate eklenebilir.
 */
export async function findAll(opts?: {
  limit?: number
}): Promise<MailTemplateSource[]> {
  const c = await col()
  const limit = Math.min(Math.max(opts?.limit ?? 500, 1), 2000)
  const docs = await c
    .find({})
    .sort({ updatedAt: -1 })
    .limit(limit)
    .toArray()
  return docs.map(toId) as MailTemplateSource[]
}

export async function findManyByTemplates(
  companyId: string,
  templateIds: string[],
): Promise<MailTemplateSource[]> {
  if (templateIds.length === 0) return []
  const c = await col()
  const docs = await c
    .find({ companyId, templateId: { $in: templateIds } })
    .toArray()
  return docs.map(toId) as MailTemplateSource[]
}

export async function upsert(data: {
  companyId: string
  templateId: string
  name: LocalizedString
  subject: LocalizedString
  body: LocalizedString
  sourceSystemTemplateId?: string | null
  sourceCollectionId?: string | null
  category?: string | null
}): Promise<MailTemplateSource> {
  const c = await col()
  const now = new Date()
  // Set sadece tanımlı alanları — undefined geçilirse mevcut değer korunur
  // (eski source kayıtlarına re-edit ile category ezilmesin).
  const set: Record<string, unknown> = {
    name: data.name,
    subject: data.subject,
    body: data.body,
    updatedAt: now,
  }
  if (data.sourceSystemTemplateId !== undefined) {
    set.sourceSystemTemplateId = data.sourceSystemTemplateId
  }
  if (data.sourceCollectionId !== undefined) {
    set.sourceCollectionId = data.sourceCollectionId
  }
  if (data.category !== undefined) {
    set.category = data.category
  }
  const result = await c.findOneAndUpdate(
    { companyId: data.companyId, templateId: data.templateId },
    {
      $set: set,
      $setOnInsert: {
        companyId: data.companyId,
        templateId: data.templateId,
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: "after" },
  )
  return toId(result) as MailTemplateSource
}

export async function deleteByTemplate(
  companyId: string,
  templateId: string,
): Promise<boolean> {
  const c = await col()
  const result = await c.deleteOne({ companyId, templateId })
  return result.deletedCount === 1
}

/**
 * Domain transfer / re-assign için: bir template id setini eski companyId'den
 * yenisine taşır. Compound index `(companyId, templateId)` unique olduğu
 * için yeni `(toCompanyId, templateId)` zaten varsa update tetiklenir,
 * yoksa update no-op döner. Toplu rename pattern, listeyi al + her kayıt
 * için update.
 */
export async function reassignTemplates(
  templateIds: string[],
  fromCompanyId: string,
  toCompanyId: string,
): Promise<number> {
  if (templateIds.length === 0) return 0
  const c = await col()
  const result = await c.updateMany(
    { companyId: fromCompanyId, templateId: { $in: templateIds } },
    { $set: { companyId: toCompanyId, updatedAt: new Date() } },
  )
  return result.modifiedCount
}
