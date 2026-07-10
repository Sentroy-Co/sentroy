import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "system_template_collections"

export type LocalizedString = Record<string, string>

/**
 * Şablon koleksiyonu — aynı tasarım çizgisindeki birden fazla kategoride
 * template'i bir araya toplayan grup. Admin koleksiyonu yaratır + her
 * template oluştururken hangi koleksiyona ait olduğunu seçer (opsiyonel).
 * User browse sırasında "tüm koleksiyonu klonla" seçeneği bu yapı sayesinde
 * tek tıkla N şablonu kullanıcının catalog'una çıkarır.
 */
export interface TemplateCollection {
  id: string
  /** Stable slug — listing/clone için. */
  key: string
  name: LocalizedString
  description: LocalizedString
  /** Koleksiyon kapağı — istemcide grid kart görseli. Snapshot pipeline
   *  şu an sadece template'ler için yazıyor; kapak admin URL girer veya
   *  sonra bir snapshot tool'u eklenir. */
  coverUrl: string | null
  /** User browse'da görünür mü. */
  isPublic: boolean
  order: number
  createdAt: Date
  updatedAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function list(opts: { onlyPublic?: boolean } = {}): Promise<
  TemplateCollection[]
> {
  const c = await col()
  const filter = opts.onlyPublic ? { isPublic: true } : {}
  const docs = await c.find(filter).sort({ order: 1, createdAt: -1 }).toArray()
  return docs.map(toId) as TemplateCollection[]
}

export async function findById(id: string): Promise<TemplateCollection | null> {
  const c = await col()
  const doc = await c.findOne({ _id: toObjectId(id) })
  return toId(doc) as TemplateCollection | null
}

export async function create(data: {
  key: string
  name: LocalizedString
  description: LocalizedString
  coverUrl?: string | null
  isPublic?: boolean
  order?: number
}): Promise<TemplateCollection> {
  const c = await col()
  const now = new Date()
  const doc = {
    key: data.key.trim(),
    name: data.name,
    description: data.description,
    coverUrl: data.coverUrl ?? null,
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
  data: Partial<Omit<TemplateCollection, "id" | "createdAt" | "updatedAt">>,
): Promise<TemplateCollection | null> {
  const c = await col()
  const updated = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    { $set: { ...data, updatedAt: new Date() } },
    { returnDocument: "after" },
  )
  return toId(updated) as TemplateCollection | null
}

export async function deleteById(id: string): Promise<boolean> {
  const c = await col()
  const result = await c.deleteOne({ _id: toObjectId(id) })
  return result.deletedCount === 1
}
