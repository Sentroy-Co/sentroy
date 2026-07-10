import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "system_email_templates"

export type LocalizedString = Record<string, string>

/**
 * Sabit kategori seti — admin formunda dropdown'a düşer, user browse
 * tarafında filter olarak kullanılır. Yeni kategori eklemek için sadece
 * bu listeye satır eklemek yeter (DB'de string olarak saklanır).
 */
export const TEMPLATE_CATEGORIES = [
  "otp",
  "verification",
  "password-reset",
  "welcome",
  "newsletter",
  "transactional",
  "billing",
  "marketing",
  "notification",
  "other",
] as const

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]

export interface SystemEmailTemplate {
  id: string
  /** Insan-okur unique slug — listing/clone için stable identifier. */
  key: string
  /** Opsiyonel — aynı tasarım çizgisindeki şablonları gruplayan
   *  TemplateCollection id'si. null = standalone. User browse'da
   *  "tüm koleksiyonu klonla" seçeneği bu alanı kullanır. */
  collectionId: string | null
  name: LocalizedString
  description: LocalizedString
  category: TemplateCategory
  subject: LocalizedString
  /** HTML body — panelde MJML editor yok; raw HTML saklanır. Sentroy
   *  mail-server `mjmlBody` alanını HTML olarak da kabul ediyor (compile
   *  fail olursa raw döner). Bizim katmanda alan adı semantik olarak
   *  htmlBody. */
  htmlBody: LocalizedString
  /** Variable name listesi (örn ["userName", "verifyUrl"]) — clone
   *  sırasında kullanıcının görmesi için. */
  variables: string[]
  /** Storage'daki thumbnail URL'i. Phase 4'te canvas snapshot ile yazılır. */
  thumbnailUrl: string | null
  /** User browse'da görünür mü. */
  isPublic: boolean
  order: number
  createdAt: Date
  updatedAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function list(opts: {
  onlyPublic?: boolean
  category?: TemplateCategory
  collectionId?: string | null
} = {}): Promise<SystemEmailTemplate[]> {
  const c = await col()
  const filter: Record<string, unknown> = {}
  if (opts.onlyPublic) filter.isPublic = true
  if (opts.category) filter.category = opts.category
  if (opts.collectionId !== undefined) filter.collectionId = opts.collectionId
  const docs = await c.find(filter).sort({ order: 1, createdAt: -1 }).toArray()
  return docs.map(toId) as SystemEmailTemplate[]
}

export async function findById(id: string): Promise<SystemEmailTemplate | null> {
  const c = await col()
  const doc = await c.findOne({ _id: toObjectId(id) })
  return toId(doc) as SystemEmailTemplate | null
}

export async function create(data: {
  key: string
  collectionId?: string | null
  name: LocalizedString
  description: LocalizedString
  category: TemplateCategory
  subject: LocalizedString
  htmlBody: LocalizedString
  variables?: string[]
  thumbnailUrl?: string | null
  isPublic?: boolean
  order?: number
}): Promise<SystemEmailTemplate> {
  const c = await col()
  const now = new Date()
  const doc = {
    key: data.key.trim(),
    collectionId: data.collectionId ?? null,
    name: data.name,
    description: data.description,
    category: data.category,
    subject: data.subject,
    htmlBody: data.htmlBody,
    variables: data.variables ?? [],
    thumbnailUrl: data.thumbnailUrl ?? null,
    isPublic: data.isPublic ?? true,
    order: data.order ?? 0,
    createdAt: now,
    updatedAt: now,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

export async function updateById(
  id: string,
  data: Partial<Omit<SystemEmailTemplate, "id" | "createdAt" | "updatedAt">>,
): Promise<SystemEmailTemplate | null> {
  const c = await col()
  const updated = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    { $set: { ...data, updatedAt: new Date() } },
    { returnDocument: "after" },
  )
  return toId(updated) as SystemEmailTemplate | null
}

export async function deleteById(id: string): Promise<boolean> {
  const c = await col()
  const result = await c.deleteOne({ _id: toObjectId(id) })
  return result.deletedCount === 1
}
