import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "mail_template_thumbnails"

/**
 * Kullanıcı template'lerinin (sentroy mail-server'da yaşar) preview
 * snapshot URL'leri. Template doc'una eklemek yerine ayrı koleksiyon
 * kullanılıyor: mail-server schema'sını değiştirmiyoruz, lookup ucuz
 * (companyId+templateId compound index) ve template silindiğinde orphan
 * temizliği için ayrı silme yolumuz var.
 */
export interface MailTemplateThumbnail {
  id: string
  companyId: string
  /** Sentroy template id — string. */
  templateId: string
  url: string
  /** Hangi cdn media doc'una karşılık geldiği — re-upload sırasında eskisini
   *  silmek için. */
  mediaId: string
  createdAt: Date
  updatedAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function findByTemplate(
  companyId: string,
  templateId: string,
): Promise<MailTemplateThumbnail | null> {
  const c = await col()
  const doc = await c.findOne({ companyId, templateId })
  return toId(doc) as MailTemplateThumbnail | null
}

export async function findManyByTemplates(
  companyId: string,
  templateIds: string[],
): Promise<MailTemplateThumbnail[]> {
  if (templateIds.length === 0) return []
  const c = await col()
  const docs = await c
    .find({ companyId, templateId: { $in: templateIds } })
    .toArray()
  return docs.map(toId) as MailTemplateThumbnail[]
}

/**
 * Cross-company toplu lookup — admin gallery için. companyId ön-filter
 * yapmadan template id setini alır. Storage tarafında thumbnail kaydı
 * companyId+templateId tekil olduğundan duplicate dönmez.
 */
export async function findManyByTemplateIdsAcrossCompanies(
  templateIds: string[],
): Promise<MailTemplateThumbnail[]> {
  if (templateIds.length === 0) return []
  const c = await col()
  const docs = await c
    .find({ templateId: { $in: templateIds } })
    .toArray()
  return docs.map(toId) as MailTemplateThumbnail[]
}

export async function upsert(data: {
  companyId: string
  templateId: string
  url: string
  mediaId: string
}): Promise<MailTemplateThumbnail> {
  const c = await col()
  const now = new Date()
  const result = await c.findOneAndUpdate(
    { companyId: data.companyId, templateId: data.templateId },
    {
      $set: { url: data.url, mediaId: data.mediaId, updatedAt: now },
      $setOnInsert: {
        companyId: data.companyId,
        templateId: data.templateId,
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: "after" },
  )
  return toId(result) as MailTemplateThumbnail
}

export async function deleteByTemplate(
  companyId: string,
  templateId: string,
): Promise<boolean> {
  const c = await col()
  const result = await c.deleteOne({ companyId, templateId })
  return result.deletedCount === 1
}

export async function deleteById(id: string): Promise<boolean> {
  const c = await col()
  const result = await c.deleteOne({ _id: toObjectId(id) })
  return result.deletedCount === 1
}

/**
 * Domain transfer / re-assign için bulk migration. Aynı pattern:
 * `mail-template-source.reassignTemplates`.
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
