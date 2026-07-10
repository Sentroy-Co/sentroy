import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "env_projects"

/**
 * Sentroy Env Vault — bir "project" Sentroy admin tarafından kayıtlı,
 * birden çok environment (dev/staging/prod vb.) altında env variable
 * tutan top-level bağımsız ünite. Self-host edilen her uygulama bir
 * proje (örn. "sentroy-core", "my-blog", "client-x").
 *
 * Yetki modeli: şu an sadece `system-admin` CRUD yapabilir
 * (`canManageEnvVault`); ileride per-company expose edilebilir.
 */
export interface EnvProject {
  id: string
  /** URL-safe unique identifier; SDK fetch'lerinde kullanılır.
   *  (companyId, slug) çifti unique — farklı şirketler aynı slug'ı
   *  kullanabilir (örn. iki müşterinin de "my-blog"u olabilir). */
  slug: string
  /** İnsan-okur isim — admin UI'da gösterilir. */
  name: string
  /** Opsiyonel açıklama. */
  description: string | null
  /** Hangi env'lerin "default" olduğu — ilk token üretiminde önerilir. */
  defaultEnvironment: string
  /** Per-company isolation. `null` ise system-admin tarafından oluşturulmuş
   *  (legacy/Sentroy'un kendi kullanımı için). End-user vault.sentroy.com
   *  üzerinden CRUD yaparken bu alan zorunlu. */
  companyId: string | null
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function findAll(): Promise<EnvProject[]> {
  const c = await col()
  const docs = await c.find({}).sort({ createdAt: -1 }).toArray()
  return docs.map(toId)
}

/** Bir company'nin proje listesi — vault.sentroy.com için. */
export async function findByCompany(companyId: string): Promise<EnvProject[]> {
  const c = await col()
  const docs = await c
    .find({ companyId })
    .sort({ createdAt: -1 })
    .toArray()
  return docs.map(toId)
}

/** Slug + scope (companyId or null) tek-uniq lookup. Aynı slug iki
 *  farklı company'de var olabilir, biz hangisini istediğimizi belirtiriz. */
export async function findBySlug(
  slug: string,
  companyId: string | null = null,
): Promise<EnvProject | null> {
  const c = await col()
  const doc = await c.findOne({ slug, companyId })
  return doc ? toId(doc) : null
}

export async function findById(id: string): Promise<EnvProject | null> {
  const c = await col()
  const doc = await c.findOne({ _id: toObjectId(id) })
  return doc ? toId(doc) : null
}

export async function create(input: {
  slug: string
  name: string
  description?: string | null
  defaultEnvironment?: string
  /** End-user akışı için company id zorunlu; system-admin null geçer. */
  companyId?: string | null
  createdBy: string
}): Promise<EnvProject> {
  const c = await col()
  const now = new Date()
  const doc = {
    slug: input.slug.trim().toLowerCase(),
    name: input.name.trim(),
    description: input.description?.trim() || null,
    defaultEnvironment: input.defaultEnvironment ?? "prod",
    companyId: input.companyId ?? null,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

export async function update(
  id: string,
  patch: Partial<Pick<EnvProject, "name" | "description" | "defaultEnvironment">>,
): Promise<boolean> {
  const c = await col()
  const $set: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.name !== undefined) $set.name = patch.name.trim()
  if (patch.description !== undefined)
    $set.description = patch.description?.trim() || null
  if (patch.defaultEnvironment !== undefined)
    $set.defaultEnvironment = patch.defaultEnvironment
  const result = await c.updateOne({ _id: toObjectId(id) }, { $set })
  return result.matchedCount === 1
}

export async function remove(id: string): Promise<boolean> {
  const c = await col()
  const result = await c.deleteOne({ _id: toObjectId(id) })
  return result.deletedCount === 1
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  // (companyId, slug) çifti unique — null companyId admin'inkilerin ortak
  // namespace'i (admin tarafında slug zaten unique tutulur, çakışma yok).
  await c.createIndex({ companyId: 1, slug: 1 }, { unique: true })
  await c.createIndex({ companyId: 1, createdAt: -1 })
}
