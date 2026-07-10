import { getDb } from "../client"
import type { BucketFolder } from "../types"
import { toId } from "./_helpers"

const COLLECTION = "bucketFolders"

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function findByBucket(bucketId: string): Promise<BucketFolder[]> {
  const c = await col()
  const docs = await c.find({ bucketId }).sort({ path: 1 }).toArray()
  return docs.map(toId)
}

export async function findByPath(
  bucketId: string,
  path: string,
): Promise<BucketFolder | null> {
  const c = await col()
  const doc = await c.findOne({ bucketId, path })
  return toId(doc)
}

export async function create(
  data: Omit<BucketFolder, "id" | "createdAt" | "updatedAt">,
): Promise<BucketFolder> {
  const existing = await findByPath(data.bucketId, data.path)
  if (existing) return existing

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

/**
 * Folder ve descendant'larının path'ini toplu yeniden adlandırır.
 * `from` ile başlayan tüm path'lerde prefix `to` ile değiştirilir.
 *
 * Çakışma kontrolü: yeni path'lerden herhangi biri başka bir explicit
 * folder ile çakışıyorsa update yapılmaz, `{ ok: false, conflict }` döner.
 * Caller media bulk-rename'i conflict yokken çağırmalı (atomicity).
 *
 * Not: Yalnızca `bucketFolders` koleksiyonunu günceller. Media
 * doc'larındaki `folder` field'ları için `mediaModel.renameFolderPrefix`
 * ayrıca çağrılmalı.
 */
export async function rename(
  bucketId: string,
  fromPath: string,
  toPath: string,
): Promise<
  | { ok: true; renamed: number }
  | { ok: false; conflict: string }
> {
  const c = await col()
  // Hedef path zaten var mı?
  const conflictDoc = await c.findOne({ bucketId, path: toPath })
  if (conflictDoc) return { ok: false, conflict: toPath }

  // Bu folder + descendant'ları topla
  const escaped = fromPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const docs = await c
    .find({
      bucketId,
      $or: [
        { path: fromPath },
        { path: { $regex: `^${escaped}/` } },
      ],
    })
    .toArray()

  // Her descendant için yeni path hesapla, conflict kontrolü
  const updates = docs.map((doc) => {
    const oldPath = doc.path as string
    const suffix = oldPath === fromPath ? "" : oldPath.slice(fromPath.length)
    const newPath = toPath + suffix
    return { _id: doc._id, oldPath, newPath }
  })

  // Yeni path'lerden herhangi biri başka bir folder'la çakışıyor mu
  // (set içinde duplicate veya bucketta var olan başka bir doc'ta)?
  const newPaths = new Set(updates.map((u) => u.newPath))
  if (newPaths.size !== updates.length) {
    return { ok: false, conflict: toPath }
  }
  const updateIds = updates.map((u) => u.oldPath)
  const others = await c
    .find({
      bucketId,
      path: { $in: Array.from(newPaths) },
    })
    .toArray()
  const blocking = others.find(
    (d) => !updateIds.includes(d.path as string),
  )
  if (blocking) return { ok: false, conflict: blocking.path as string }

  const now = new Date()
  for (const u of updates) {
    await c.updateOne(
      { _id: u._id },
      { $set: { path: u.newPath, updatedAt: now } },
    )
  }
  return { ok: true, renamed: updates.length }
}

/**
 * Belirli bir folder'ı + descendant'larını (path'i prefix eşleşen tüm
 * kayıtları) tek query ile siler. Caller media bulk delete'i ayrıca
 * çağırmalı (folder-doc delete sadece klasör listesini temizler;
 * dosyalar farklı koleksiyonda).
 */
export async function removeFolderTree(
  bucketId: string,
  fromPath: string,
): Promise<number> {
  const c = await col()
  const escaped = fromPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const result = await c.deleteMany({
    bucketId,
    $or: [
      { path: fromPath },
      { path: { $regex: `^${escaped}/` } },
    ],
  })
  return result.deletedCount ?? 0
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ bucketId: 1, path: 1 }, { unique: true })
  await c.createIndex({ companyId: 1, bucketId: 1 })
}
