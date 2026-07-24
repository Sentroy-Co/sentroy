import { getDb } from "../client"
import type { Bucket, StorageAccess } from "../types"
import type { StorageViewer } from "./media"
import { toId, toObjectId } from "./_helpers"
import { isSystemManagedBucketSlug } from "../constants"

const COLLECTION = "buckets"

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

/**
 * Bucket'ın şirket-içi erişim tier'ına göre izleyiciye görünür olup olmadığı
 * (media/folder'daki canViewItem'ın JS eşiti). everyone/legacy → herkes; sahibi
 * her tier'da; admins → yalnız admin; owner → yalnız sahip. Böylece kısıtlı bir
 * bucket ne listede ne de slug'la (alt route'lar) erişilebilir olur.
 */
function canViewBucket(bucket: Bucket, viewer: StorageViewer): boolean {
  const tier = bucket.access ?? "everyone"
  if (tier === "everyone") return true
  if (bucket.ownerUserId && bucket.ownerUserId === viewer.userId) return true
  if (tier === "admins") return viewer.isAdmin
  return false // "owner" → yalnız sahip (yukarıda döndü)
}

export async function findByCompany(companyId: string): Promise<Bucket[]> {
  const c = await col()
  const docs = await c
    .find({ companyId })
    .sort({ createdAt: -1 })
    .toArray()
  return docs.map(toId)
}

/**
 * Kullanıcıya görünür bucket'lar. `viewer` verilirse (session/token) erişim
 * tier'ı filtresi uygulanır; null verilirse (sistem bağlamı) yalnız
 * system-managed elenir (eski davranış).
 */
export async function findUserVisibleByCompany(
  companyId: string,
  viewer: StorageViewer | null,
): Promise<Bucket[]> {
  const buckets = await findByCompany(companyId)
  return buckets.filter(
    (bucket) =>
      !isSystemManagedBucketSlug(bucket.slug) &&
      (viewer === null || canViewBucket(bucket, viewer)),
  )
}

export async function findById(id: string): Promise<Bucket | null> {
  const c = await col()
  const doc = await c.findOne({ _id: toObjectId(id) })
  return toId(doc)
}

export async function findBySlug(
  companyId: string,
  slug: string,
): Promise<Bucket | null> {
  const c = await col()
  const doc = await c.findOne({ companyId, slug })
  return toId(doc)
}

/**
 * Slug ile kullanıcıya görünür bucket — TÜM bucket alt route'larının (media,
 * folder, move, download …) tek bucket gate'i. `viewer` verilirse erişim tier'ı
 * gate'i uygulanır (kısıtlı bucket → null → 404); null verilirse yalnız
 * system-managed elenir (public serve / sistem bağlamı).
 */
export async function findUserVisibleBySlug(
  companyId: string,
  slug: string,
  viewer: StorageViewer | null,
): Promise<Bucket | null> {
  if (isSystemManagedBucketSlug(slug)) return null
  const bucket = await findBySlug(companyId, slug)
  if (!bucket) return null
  if (viewer !== null && !canViewBucket(bucket, viewer)) return null
  return bucket
}

export async function create(
  data: Omit<Bucket, "id" | "createdAt" | "updatedAt">,
): Promise<Bucket> {
  const c = await col()
  const now = new Date()
  // Erişim tier'ı varsayılanı everyone (mevcut davranış: tüm üyeler görür).
  const access: StorageAccess = data.access ?? "everyone"
  const doc = { ...data, access, createdAt: now, updatedAt: now }
  const result = await c.insertOne(doc)
  return {
    id: result.insertedId.toString(),
    ...doc,
  }
}

export async function updateById(
  id: string,
  data: Partial<Bucket>,
): Promise<Bucket | null> {
  const c = await col()
  const { id: _ignoreId, ...updateData } = data as any
  const result = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    { $set: { ...updateData, updatedAt: new Date() } },
    { returnDocument: "after" },
  )
  return toId(result)
}

export async function incrementUsage(
  id: string,
  delta: { storageUsed?: number; fileCount?: number },
): Promise<void> {
  const c = await col()
  const inc: Record<string, number> = {}
  if (delta.storageUsed !== undefined) inc.storageUsed = delta.storageUsed
  if (delta.fileCount !== undefined) inc.fileCount = delta.fileCount
  if (Object.keys(inc).length === 0) return
  await c.updateOne(
    { _id: toObjectId(id) },
    { $inc: inc, $set: { updatedAt: new Date() } },
  )
}

export async function deleteById(id: string): Promise<void> {
  const c = await col()
  await c.deleteOne({ _id: toObjectId(id) })
}

export async function countByCompany(companyId: string): Promise<number> {
  const c = await col()
  return c.countDocuments({ companyId })
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ companyId: 1, slug: 1 }, { unique: true })
  await c.createIndex({ companyId: 1, createdAt: -1 })
}
