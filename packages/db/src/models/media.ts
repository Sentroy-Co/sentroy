import { ObjectId } from "mongodb"
import { getDb } from "../client"
import type { Media, MediaType, StorageAccess } from "../types"
import { toId, toObjectId } from "./_helpers"

/**
 * Şirket-içi erişim ($or) filtresi — hem media (ownerField="uploadedBy") hem
 * folder (ownerField="ownerUserId") için. `everyone`/legacy-null herkese;
 * sahiplik alanı eşleşen sahibe (her tier'da kendi öğesi); `admins` yalnız
 * isAdmin'e. `owner` tier'ı SADECE sahiple eşleşir → yöneticiler bile göremez.
 * (Notlardaki buildVisibilityFilter'ın storage muadili.)
 */
export function buildStorageAccessFilter(
  viewerUserId: string,
  isAdmin: boolean,
  ownerField: "uploadedBy" | "ownerUserId" = "uploadedBy",
): Record<string, unknown> {
  const or: Record<string, unknown>[] = [
    { access: { $in: ["everyone", null] } },
    { [ownerField]: viewerUserId },
    // Kişi-bazlı paylaşım grant'i (yalnız media'da; folder/bucket'ta alan yok
    // → eşleşmez, zararsız). "X seninle paylaştı" ile eklenen kullanıcı görür.
    { sharedWith: viewerUserId },
  ]
  if (isAdmin) or.push({ access: "admins" })
  return { $or: or }
}

/** findByBucket / countByBucketFilter / aggregateFolders'a geçen izleyici. */
export interface StorageViewer {
  userId: string
  isAdmin: boolean
}

// Mongoose'un default pluralizer'ı `media` kelimesini "uncountable"
// listesine dahil ediyor (mongoose/lib/helpers/pluralize.js içinde),
// yani CDN server'daki `mongoose.model("Media", schema)` kayıtları
// `media` koleksiyonuna düşer — `medias` DEĞİL. Önceki bir "fix"te
// medias'a değiştirilmişti ve UI listesini boşaltmıştı; doğrusu media.
const COLLECTION = "media"

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

/**
 * CDN server (Mongoose) media doc'larında `bucketId` / `companyId` alanlarını
 * default schema'sı gereği `ObjectId` olarak saklar; bu repo native driver
 * kullanıyor ve filter'lara hex string geçiriyor. Saf string match Mongoose-
 * yazımlı dokümanları yakalamaz, sonuç boş döner. Hem string hem ObjectId
 * variant'ını kabul eden $in filter'ı bu uyumsuzluğu kapatır — geçmiş
 * native-yazımlı kayıtlar da yine eşleşir.
 */
function idMatch(id: string): { $in: (string | ObjectId)[] } {
  let oid: ObjectId | null = null
  try {
    oid = new ObjectId(id)
  } catch {
    /* 24-char hex değilse skip — yalnızca string variant kullanılır. */
  }
  return oid ? { $in: [id, oid] } : { $in: [id] }
}

function idsMatch(ids: string[]): { $in: (string | ObjectId)[] } {
  const values: (string | ObjectId)[] = []
  for (const id of ids) {
    values.push(id)
    try {
      values.push(new ObjectId(id))
    } catch {
      /* 24-char hex değilse string variant yeterli. */
    }
  }
  return { $in: values }
}

function toObjectIds(ids: string[]): ObjectId[] {
  const values: ObjectId[] = []
  for (const id of ids) {
    try {
      values.push(new ObjectId(id))
    } catch {
      /* invalid media id — caller validation should normally catch this. */
    }
  }
  return values
}

export function getFileType(mimeType: string): MediaType {
  if (mimeType.startsWith("image/")) return "image"
  if (mimeType.startsWith("video/")) return "video"
  if (mimeType.startsWith("audio/")) return "audio"
  if (
    mimeType.includes("pdf") ||
    mimeType.includes("document") ||
    mimeType.includes("text")
  )
    return "document"
  return "other"
}

export type MediaSortKey =
  | "displayOrder"
  | "name"
  | "size"
  | "createdAt"
  | "type"
export type MediaSortDir = "asc" | "desc"

/**
 * Q parametresi case-insensitive substring match: originalName, alt,
 * caption, tags üzerinde aranır. Boş string verilirse filter atılır.
 */
function buildSearchClause(
  q: string | undefined,
): Record<string, unknown> | null {
  if (!q || !q.trim()) return null
  // Regex escape — kullanıcı `.` `(` gibi karakter girerse literal arar.
  const escaped = q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const rx = new RegExp(escaped, "i")
  return {
    $or: [
      { originalName: { $regex: rx } },
      { alt: { $regex: rx } },
      { caption: { $regex: rx } },
      { tags: { $regex: rx } },
    ],
  }
}

export async function findByBucket(
  bucketId: string,
  opts?: {
    type?: MediaType
    folder?: string
    tags?: string[]
    q?: string
    sort?: MediaSortKey
    dir?: MediaSortDir
    limit?: number
    skip?: number
    /** Set edilirse erişim ($or) filtresi uygulanır (owner/admins/everyone). */
    viewer?: StorageViewer
  },
): Promise<Media[]> {
  const c = await col()
  const filter: Record<string, unknown> = { bucketId: idMatch(bucketId) }
  if (opts?.type) filter.type = opts.type
  if (opts?.folder !== undefined) filter.folder = opts.folder
  if (opts?.tags?.length) filter.tags = { $all: opts.tags }
  // Birden çok $or (arama + erişim) çakışmasın diye $and altında topla.
  const and: Record<string, unknown>[] = []
  const search = buildSearchClause(opts?.q)
  if (search) and.push(search)
  if (opts?.viewer) {
    and.push(
      buildStorageAccessFilter(opts.viewer.userId, opts.viewer.isAdmin),
    )
  }
  if (and.length) filter.$and = and

  const sortKey = opts?.sort ?? "displayOrder"
  const dirSign = opts?.dir === "desc" ? -1 : 1

  /**
   * Sort stratejisi:
   *   - "displayOrder": null kayıtlar sona — `$ifNull` ile placeholder.
   *     Bu mode default; DnD reorder bu alana yazıyor. Tie-breaker
   *     `createdAt DESC` (yeni gelen önce).
   *   - Diğerleri: native field sort + tie-breaker `_id` (deterministic
   *     pagination — Mongo skip/limit aynı ofset için aynı kümeyi döndürsün).
   */
  const pipeline: Record<string, unknown>[] = [{ $match: filter }]
  if (sortKey === "displayOrder") {
    pipeline.push(
      {
        $addFields: {
          _ord: { $ifNull: ["$displayOrder", Number.MAX_SAFE_INTEGER] },
        },
      },
      { $sort: { _ord: dirSign, createdAt: -1, _id: 1 } },
      { $unset: "_ord" },
    )
  } else {
    const fieldMap: Record<MediaSortKey, string> = {
      displayOrder: "displayOrder",
      name: "originalName",
      size: "size",
      createdAt: "createdAt",
      type: "type",
    }
    const sortField = fieldMap[sortKey] ?? "createdAt"
    pipeline.push({ $sort: { [sortField]: dirSign, _id: 1 } })
  }
  if (opts?.skip) pipeline.push({ $skip: opts.skip })
  if (opts?.limit) pipeline.push({ $limit: opts.limit })

  const docs = await c.aggregate(pipeline).toArray()
  return docs.map(toId)
}

/**
 * findByBucket ile aynı filter üzerinden toplam doküman sayısı —
 * pagination total için. Aggregation `$count` yerine collection
 * countDocuments daha hızlı (index hit, pipeline materialize yok).
 */
export async function countByBucketFilter(
  bucketId: string,
  opts?: {
    type?: MediaType
    folder?: string
    tags?: string[]
    q?: string
    viewer?: StorageViewer
  },
): Promise<number> {
  const c = await col()
  const filter: Record<string, unknown> = { bucketId: idMatch(bucketId) }
  if (opts?.type) filter.type = opts.type
  if (opts?.folder !== undefined) filter.folder = opts.folder
  if (opts?.tags?.length) filter.tags = { $all: opts.tags }
  const and: Record<string, unknown>[] = []
  const search = buildSearchClause(opts?.q)
  if (search) and.push(search)
  if (opts?.viewer) {
    and.push(
      buildStorageAccessFilter(opts.viewer.userId, opts.viewer.isAdmin),
    )
  }
  if (and.length) filter.$and = and
  return c.countDocuments(filter)
}

/**
 * Bucket icindeki bir id alt setini sirayla `displayOrder` 0..N-1 ile
 * isaretler. Ids icinde olmayan media doc'lari dokunulmaz; onlarin
 * `displayOrder`'i mevcut degeri korur veya null kalir (sonda gorunur).
 *
 * Tam bucket reorder icin caller tum id'leri yollamali; partial
 * (drag-drop subset) icin kullanmaz — UI uygulamasi tum gridi gonderir.
 *
 * BulkWrite atomic degil ama gunde yuzlerce reorder beklenmiyor; race
 * acilirsa son yazan kazanir.
 */
export async function reorderInBucket(
  bucketId: string,
  orderedIds: string[],
): Promise<number> {
  if (orderedIds.length === 0) return 0
  const c = await col()
  const ops = orderedIds.map((id, index) => ({
    updateOne: {
      filter: { _id: toObjectId(id), bucketId: idMatch(bucketId) },
      update: { $set: { displayOrder: index, updatedAt: new Date() } },
    },
  }))
  const result = await c.bulkWrite(ops)
  return result.modifiedCount
}

export async function findById(id: string): Promise<Media | null> {
  const c = await col()
  const doc = await c.findOne({ _id: toObjectId(id) })
  return toId(doc)
}

export async function findByFileName(
  bucketId: string,
  fileName: string,
): Promise<Media | null> {
  const c = await col()
  const doc = await c.findOne({ bucketId: idMatch(bucketId), fileName })
  return toId(doc)
}

export async function create(
  data: Omit<Media, "id" | "createdAt" | "updatedAt">,
): Promise<Media> {
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

/**
 * CDN-server'ın yazmayı garanti edemediği durumda upload sonrası local
 * DB'ye media doc'unu yansıtır. Idempotent — aynı `_id` (CDN-server'ın
 * ürettiği `mediaId`) üzerinden upsert. CDN-server kendi DB'sine ileride
 * yazmaya başlarsa duplicate yaratmaz, sadece güncelleme olur.
 *
 * `id` 24-char hex değilse (bazı CDN-server implementasyonları nanoid
 * benzeri kısa id verebilir) yeni ObjectId oluşturulur ve ona yazılır;
 * CDN-server ile id senkronizasyonu o senaryoda kaybolur ama doc en
 * azından oluşur.
 */
export async function upsertFromCdn(
  id: string,
  data: Omit<Media, "id" | "createdAt" | "updatedAt"> & {
    createdAt?: string | Date
    updatedAt?: string | Date
  },
): Promise<Media> {
  const c = await col()
  const now = new Date()
  let _id: ObjectId
  try {
    _id = new ObjectId(id)
  } catch {
    _id = new ObjectId()
  }
  const { createdAt, updatedAt, ...rest } = data
  const createdAtDate = createdAt ? new Date(createdAt) : now
  const updatedAtDate = updatedAt ? new Date(updatedAt) : now

  await c.updateOne(
    { _id },
    {
      $set: {
        ...rest,
        updatedAt: updatedAtDate,
      },
      $setOnInsert: { createdAt: createdAtDate },
    },
    { upsert: true },
  )

  const doc = await c.findOne({ _id })
  return toId(doc) as Media
}

export async function updateById(
  id: string,
  data: Partial<Media>,
): Promise<Media | null> {
  const c = await col()
  const { id: _ignoreId, ...updateData } = data as any
  const result = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    { $set: { ...updateData, updatedAt: new Date() } },
    { returnDocument: "after" },
  )
  return toId(result)
}

export async function deleteById(id: string): Promise<void> {
  const c = await col()
  await c.deleteOne({ _id: toObjectId(id) })
}

/**
 * Kişi-bazlı paylaşım grant'i — verilen kullanıcıları `sharedWith`'e ekler
 * ($addToSet → duplike olmaz). "X seninle paylaştı" akışında alıcıya erişim.
 */
export async function addSharedWith(
  id: string,
  userIds: string[],
): Promise<void> {
  const ids = [...new Set(userIds)].filter(Boolean)
  if (ids.length === 0) return
  const c = await col()
  await c.updateOne(
    { _id: toObjectId(id) },
    {
      $addToSet: { sharedWith: { $each: ids } },
      $set: { updatedAt: new Date() },
    },
  )
}

/**
 * Bucket-scoped bulk delete — verilen id setinden bucket'a ait olanları
 * tek query ile siler. Bucket dışı id'ler bilinçli olarak yok sayılır
 * (caller iki bucket'ı karıştırabilse bile cross-bucket leak olmaz).
 *
 * Döner: silinen doküman sayısı + boyut/sayı düşürme için sumSize.
 * Caller bucket usage counter'larını bu değerlerle günceller.
 */
export async function bulkDeleteByBucket(
  bucketId: string,
  ids: string[],
): Promise<{ deletedCount: number; sumSize: number }> {
  if (ids.length === 0) return { deletedCount: 0, sumSize: 0 }
  const objectIds = toObjectIds(ids)
  const c = await col()
  // Boyut toplamını silmeden önce hesapla — usage counter için.
  const docs = await c
    .find({ _id: { $in: objectIds }, bucketId: idMatch(bucketId) })
    .project<{ size: number }>({ size: 1 })
    .toArray()
  const sumSize = docs.reduce((acc, d) => acc + (d.size || 0), 0)
  const result = await c.deleteMany({
    _id: { $in: objectIds },
    bucketId: idMatch(bucketId),
  })
  return { deletedCount: result.deletedCount ?? 0, sumSize }
}

/**
 * Folder rename'in delete eşdeğeri: bucket içindeki belirli folder
 * altındaki TÜM media doküman'larını siler (descendant'lar dahil).
 * Caller önce CDN tarafına purge çağırıp S3 nesnelerini temizlemeli;
 * bu fonksiyon sadece DB cleanup. Döner: silinen doküman id'leri +
 * size toplamı (usage counter düşürme için).
 */
export async function findIdsInFolderTree(
  bucketId: string,
  folderPath: string,
): Promise<Array<{ id: string; size: number }>> {
  const c = await col()
  const escaped = folderPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const docs = await c
    .find({
      bucketId: idMatch(bucketId),
      $or: [
        { folder: folderPath },
        { folder: { $regex: `^${escaped}/` } },
      ],
    })
    .project<{ _id: ObjectId; size: number }>({ _id: 1, size: 1 })
    .toArray()
  return docs.map((d) => ({ id: d._id.toString(), size: d.size || 0 }))
}

/**
 * Klasör (+ descendant) ağacında BAŞKASINA ait (uploadedBy != userId) en az
 * bir media var mı? Klasör sahibinin, media.delete yetkisi olmadan yalnızca
 * tamamen kendine ait bir klasörü silebilmesini güvenceye almak için — böylece
 * başkalarının dosyaları sahiplik üzerinden silinemez.
 */
export async function hasForeignInFolderTree(
  bucketId: string,
  folderPath: string,
  userId: string,
): Promise<boolean> {
  const c = await col()
  const escaped = folderPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const doc = await c.findOne({
    bucketId: idMatch(bucketId),
    uploadedBy: { $ne: userId },
    $or: [
      { folder: folderPath },
      { folder: { $regex: `^${escaped}/` } },
    ],
  })
  return doc != null
}

export async function deleteManyByIds(
  bucketId: string,
  ids: string[],
): Promise<number> {
  if (ids.length === 0) return 0
  const c = await col()
  const result = await c.deleteMany({
    _id: { $in: toObjectIds(ids) },
    bucketId: idMatch(bucketId),
  })
  return result.deletedCount ?? 0
}

export async function countByBucket(bucketId: string): Promise<number> {
  const c = await col()
  return c.countDocuments({ bucketId: idMatch(bucketId) })
}

export async function aggregateFolders(
  bucketId: string,
  viewer?: StorageViewer,
): Promise<Array<{ folder: string; fileCount: number; storageUsed: number }>> {
  const c = await col()
  const match: Record<string, unknown> = { bucketId: idMatch(bucketId) }
  // Erişim filtresi: derived (media prefix'inden türeyen) klasörler yalnız
  // izleyicinin görebildiği media'lardan sayılsın.
  if (viewer) {
    Object.assign(match, buildStorageAccessFilter(viewer.userId, viewer.isAdmin))
  }
  const result = await c
    .aggregate([
      { $match: match },
      {
        $group: {
          _id: { $ifNull: ["$folder", ""] },
          fileCount: { $sum: 1 },
          storageUsed: { $sum: "$size" },
        },
      },
      { $sort: { _id: 1 } },
    ])
    .toArray()

  return result
    .filter((r) => typeof r._id === "string")
    .map((r) => ({
      folder: r._id as string,
      fileCount: (r.fileCount as number) ?? 0,
      storageUsed: (r.storageUsed as number) ?? 0,
    }))
}

export async function moveInBucket(
  bucketId: string,
  ids: string[],
  folder: string,
): Promise<number> {
  const objectIds = toObjectIds(ids)
  if (objectIds.length === 0) return 0
  const c = await col()
  const result = await c.updateMany(
    { _id: { $in: objectIds }, bucketId: idMatch(bucketId) },
    { $set: { folder, updatedAt: new Date() } },
  )
  return result.modifiedCount
}

/**
 * Bucket içindeki tüm media doc'larından `folder` field'ı `fromFolder` veya
 * `fromFolder/<descendant>` olanları, prefix `toFolder` ile değiştirir.
 *
 * `fromFolder` ve `toFolder` *media folder format* (örn `marketing`,
 * "marketing/2024"). Tam string match + descendant prefix match.
 *
 * Caller `bucketFolderModel.rename` ile sıralı çağırmalı; kaba bir best-
 * effort: media update fail olursa folder kaydı zaten yeni path'te kalır,
 * sonraki UI refresh'te file count tutarsız görünür ama tehlikeli değil.
 */
export async function renameFolderPrefix(
  bucketId: string,
  fromFolder: string,
  toFolder: string,
): Promise<number> {
  if (fromFolder === toFolder) return 0
  const c = await col()
  // Exact match
  const exact = await c.updateMany(
    { bucketId: idMatch(bucketId), folder: fromFolder },
    { $set: { folder: toFolder, updatedAt: new Date() } },
  )
  // Descendants — folder regex `^fromFolder/...`
  const escaped = fromFolder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const descendants = await c
    .find({
      bucketId: idMatch(bucketId),
      folder: { $regex: `^${escaped}/` },
    })
    .toArray()
  const now = new Date()
  for (const doc of descendants) {
    const oldF = doc.folder as string
    const newF = toFolder + oldF.slice(fromFolder.length)
    await c.updateOne(
      { _id: doc._id },
      { $set: { folder: newF, updatedAt: now } },
    )
  }
  return exact.modifiedCount + descendants.length
}

export async function setBucketVisibility(
  bucketId: string,
  isPublic: boolean,
): Promise<number> {
  const c = await col()
  const result = await c.updateMany(
    { bucketId: idMatch(bucketId) },
    { $set: { isPublic, updatedAt: new Date() } },
  )
  return result.modifiedCount
}

/**
 * Bir klasör (+ descendant'ları) altındaki TÜM media'nın `access` tier'ını
 * ayarlar — folder private yapıldığında içeriğe cascade. Böylece dosya
 * görünürlüğü tek kaynaktan (media.access) yürür; klasör private ise içindeki
 * dosyalar da liste filtresinden düşer. `isPublic` (anonim CDN) DOKUNULMAZ.
 * (setBucketVisibility'nin folder-scoped muadili; renameFolderPrefix ile aynı
 * subtree eşleşmesi.)
 */
export async function setFolderAccess(
  bucketId: string,
  folderPath: string,
  access: StorageAccess,
): Promise<number> {
  const c = await col()
  const escaped = folderPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const result = await c.updateMany(
    {
      bucketId: idMatch(bucketId),
      $or: [
        { folder: folderPath },
        { folder: { $regex: `^${escaped}/` } },
      ],
    },
    { $set: { access, updatedAt: new Date() } },
  )
  return result.modifiedCount ?? 0
}

/**
 * Usage summary — type başına toplam byte + file count. Usage page'de
 * görsel dağılım için.
 */
export async function aggregateByTypeForCompany(
  companyId: string,
  opts?: { bucketIds?: string[] },
): Promise<Array<{ type: MediaType; size: number; count: number }>> {
  if (opts?.bucketIds && opts.bucketIds.length === 0) return []
  const c = await col()
  const match: Record<string, unknown> = { companyId: idMatch(companyId) }
  if (opts?.bucketIds) match.bucketId = idsMatch(opts.bucketIds)
  const result = await c
    .aggregate([
      { $match: match },
      {
        $group: {
          _id: "$type",
          size: { $sum: "$size" },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray()
  return result.map((r) => ({
    type: r._id as MediaType,
    size: (r.size as number) ?? 0,
    count: (r.count as number) ?? 0,
  }))
}

/**
 * Son N günün her günü için toplam upload byte + count'unu döndürür.
 * Eksik günler 0 ile doldurulur — frontend chart'ı sürekli akış gösterir.
 *
 * Tarihler UTC'ye yuvarlanır (`$dateTrunc`). Frontend kendi locale'inde
 * formatlar; raw ISO date string emiliyor.
 */
export async function aggregateUploadsTimeSeries(
  companyId: string,
  days = 30,
  opts?: { bucketIds?: string[] },
): Promise<Array<{ date: string; size: number; count: number }>> {
  if (opts?.bucketIds && opts.bucketIds.length === 0) {
    return emptyUploadTimeSeries(days)
  }
  const c = await col()
  const since = new Date()
  since.setUTCHours(0, 0, 0, 0)
  since.setUTCDate(since.getUTCDate() - (days - 1))
  const match: Record<string, unknown> = {
    companyId: idMatch(companyId),
    createdAt: { $gte: since },
  }
  if (opts?.bucketIds) match.bucketId = idsMatch(opts.bucketIds)

  const result = await c
    .aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            $dateTrunc: { date: "$createdAt", unit: "day", timezone: "UTC" },
          },
          size: { $sum: "$size" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ])
    .toArray()

  const map = new Map<string, { size: number; count: number }>()
  for (const r of result) {
    const key = (r._id as Date).toISOString().slice(0, 10)
    map.set(key, { size: (r.size as number) ?? 0, count: (r.count as number) ?? 0 })
  }

  return fillUploadTimeSeries(days, since, map)
}

/**
 * Şirket genelinde en son yüklenen N media doc'u. Overview sayfasında
 * "Recent uploads" şeridi için — bucket-agnostik, createdAt DESC.
 */
export async function findRecentForCompany(
  companyId: string,
  limit = 10,
  opts?: { bucketIds?: string[] },
): Promise<Media[]> {
  if (opts?.bucketIds && opts.bucketIds.length === 0) return []
  const c = await col()
  const filter: Record<string, unknown> = { companyId: idMatch(companyId) }
  if (opts?.bucketIds) filter.bucketId = idsMatch(opts.bucketIds)
  const docs = await c
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray()
  return docs.map(toId) as Media[]
}

function emptyUploadTimeSeries(
  days: number,
): Array<{ date: string; size: number; count: number }> {
  const since = new Date()
  since.setUTCHours(0, 0, 0, 0)
  since.setUTCDate(since.getUTCDate() - (days - 1))
  return fillUploadTimeSeries(days, since, new Map())
}

function fillUploadTimeSeries(
  days: number,
  since: Date,
  map: Map<string, { size: number; count: number }>,
): Array<{ date: string; size: number; count: number }> {
  const out: Array<{ date: string; size: number; count: number }> = []
  for (let i = 0; i < days; i++) {
    const d = new Date(since)
    d.setUTCDate(since.getUTCDate() + i)
    const key = d.toISOString().slice(0, 10)
    const hit = map.get(key)
    out.push({ date: key, size: hit?.size ?? 0, count: hit?.count ?? 0 })
  }
  return out
}

export async function sumSizeByBucket(bucketId: string): Promise<number> {
  const c = await col()
  const result = await c
    .aggregate([
      { $match: { bucketId: idMatch(bucketId) } },
      { $group: { _id: null, total: { $sum: "$size" } } },
    ])
    .toArray()
  return (result[0]?.total as number) ?? 0
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ bucketId: 1, fileName: 1 }, { unique: true })
  await c.createIndex({ bucketId: 1, createdAt: -1 })
  await c.createIndex({ bucketId: 1, displayOrder: 1 })
  await c.createIndex({ companyId: 1, createdAt: -1 })
  await c.createIndex({ companyId: 1, type: 1, createdAt: -1 })
  await c.createIndex({ tags: 1 })
}
