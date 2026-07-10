import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"
import {
  type LocalizedText,
  normalizeLocalized,
  sanitizeLocalizedInput,
} from "../types/localized"

const COLLECTION = "status_incidents"

/**
 * Status Incident — Atlassian Statuspage incident pattern'i.
 * - Manuel: kullanıcı dashboard'tan açar (planlanmamış sorun bildirimi).
 * - Auto: Phase 5 worker, sustained failure (3+ ardışık down) tespit
 *   ettiğinde otomatik açar; çözülünce kullanıcı manuel "Resolved"
 *   işaretler veya 30dk operational sonrası auto-resolve.
 *
 * Timeline updates incident'e bağlı, post-mortem için. Her update bir
 * status değişikliği veya commentary olabilir.
 *
 * affectedComponents: hangi component'leri etkiliyor (UI'da kırmızı badge).
 *
 * Public page'de aktif incident'ler en üstte (banner), past incident'ler
 * "history" sekmesinde paginate.
 */

export type IncidentStatus =
  | "investigating"
  | "identified"
  | "monitoring"
  | "resolved"

export type IncidentImpact = "minor" | "major" | "critical"

export interface IncidentUpdate {
  /** Update'in id'si (random hex). */
  id: string
  /** Bu update sırasında incident hangi status'ta. */
  status: IncidentStatus
  /** Public-facing message ({ tr, en }). Markdown destekli. Read-time
   *  normalize ile string kayıtlar otomatik wrap edilir (geriye uyumlu). */
  body: LocalizedText
  /** Update'i yapan user (Sentroy auth user id). null = system/auto. */
  authorId: string | null
  authorName: string | null
  createdAt: Date
  /** Subscribers'a email/webhook notify edildiyse timestamp. Worker tick
   *  her unnotified update için subscribers'a gönderir + mark. */
  notifiedAt?: Date | null
}

export interface StatusIncident {
  id: string
  pageId: string
  /** Public-facing başlık ({ tr, en }) — örn. "Mail delivery delays". */
  title: LocalizedText
  /** Mevcut status (en son update'in status'u). */
  status: IncidentStatus
  impact: IncidentImpact
  /** Etkilenen component id'leri (status_components.id). */
  affectedComponentIds: string[]
  /** Manuel mi auto-detected mi. */
  source: "manual" | "auto"
  /** Auto-detected ise hangi check tetikledi (referans). */
  detectedByCheckId: string | null
  startedAt: Date
  resolvedAt: Date | null
  /** Timeline updates (chronological). En son update mevcut status'u
   *  belirler. İlk insert'te 1 update zorunlu (incident creation time'da). */
  updates: IncidentUpdate[]
  /** Subscriber notify gönderildi mi (her update'ten sonra Phase 8'de). */
  notifiedAt: Date | null
  /** Post-incident review / postmortem ({ tr, en }, markdown). Resolved
   *  olduktan sonra ekibin yazdığı detaylı root-cause analizi. Public
   *  page'de incident detail dialog'unda "Postmortem" tab'ında render. */
  postmortem: LocalizedText | null
  /** Postmortem ne zaman publish edildi (audit/sıralama için). */
  postmortemPublishedAt: Date | null
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

function generateUpdateId(): string {
  return Math.random().toString(36).slice(2, 12)
}

/**
 * Mongo'dan dönen ham doc'u typed StatusIncident'a çevir. Geriye uyumluluk:
 * mevcut kayıtlardaki `title: string` ve `updates[*].body: string` shape'leri
 * `LocalizedText`'e wrap edilir.
 */
function normalizeIncident(doc: Record<string, unknown>): StatusIncident {
  const base = toId(doc) as unknown as StatusIncident
  const rawTitle = (base as unknown as { title: unknown }).title
  const rawUpdates = (base as unknown as { updates?: Array<Record<string, unknown>> }).updates
  const rawPostmortem = (base as unknown as { postmortem?: unknown }).postmortem
  ;(base as unknown as { title: LocalizedText }).title = normalizeLocalized(rawTitle)
  if (Array.isArray(rawUpdates)) {
    base.updates = rawUpdates.map((u) => ({
      ...u,
      body: normalizeLocalized(u.body),
    })) as IncidentUpdate[]
  }
  if (rawPostmortem == null) {
    base.postmortem = null
  } else {
    base.postmortem = normalizeLocalized(rawPostmortem)
  }
  if (base.postmortemPublishedAt == null) {
    base.postmortemPublishedAt = null
  }
  return base
}

// ─── Queries ──────────────────────────────────────────────────────────────

export async function findById(id: string): Promise<StatusIncident | null> {
  const c = await col()
  const doc = await c.findOne({ _id: toObjectId(id) })
  return doc ? normalizeIncident(doc) : null
}

export async function findActiveByPage(
  pageId: string,
): Promise<StatusIncident[]> {
  const c = await col()
  const docs = await c
    .find({ pageId, status: { $ne: "resolved" } })
    .sort({ startedAt: -1 })
    .toArray()
  return docs.map((d) => normalizeIncident(d))
}

/**
 * Cross-page — tüm open + son 1 saatte resolve edilmiş incident'leri
 * döner. Worker un-notified update'leri tarayabilir. 1h penceresi
 * resolve update'inin de notify edilmesini sağlar.
 */
export async function findRecentlyActiveAllPages(): Promise<StatusIncident[]> {
  const c = await col()
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
  const docs = await c
    .find({
      $or: [
        { status: { $ne: "resolved" } },
        { resolvedAt: { $gte: oneHourAgo } },
      ],
    })
    .toArray()
  return docs.map((d) => normalizeIncident(d))
}

export async function findRecentByPage(
  pageId: string,
  opts: { limit?: number; skip?: number } = {},
): Promise<StatusIncident[]> {
  const c = await col()
  const docs = await c
    .find({ pageId })
    .sort({ startedAt: -1 })
    .skip(opts.skip ?? 0)
    .limit(opts.limit ?? 25)
    .toArray()
  return docs.map((d) => normalizeIncident(d))
}

export async function countByPage(pageId: string): Promise<number> {
  const c = await col()
  return c.countDocuments({ pageId })
}

/**
 * Auto-detection için — bu check için mevcut açık incident var mı?
 * Worker sustained failure tespit edince yeni incident açmadan önce
 * existence check yapar (duplicate önleme).
 */
export async function findOpenAutoForCheck(
  checkId: string,
): Promise<StatusIncident | null> {
  const c = await col()
  const doc = await c.findOne({
    detectedByCheckId: checkId,
    source: "auto",
    status: { $ne: "resolved" },
  })
  return doc ? normalizeIncident(doc) : null
}

// ─── Mutations ────────────────────────────────────────────────────────────

export async function create(input: {
  pageId: string
  /** Localized title — { tr, en }. String verilirse her locale'a kopyalanır. */
  title: LocalizedText | string
  initialStatus: IncidentStatus
  impact: IncidentImpact
  affectedComponentIds: string[]
  source?: "manual" | "auto"
  detectedByCheckId?: string | null
  initialUpdate: {
    /** Localized body — { tr, en }. */
    body: LocalizedText | string
    authorId: string | null
    authorName: string | null
  }
  createdBy: string
}): Promise<StatusIncident> {
  const c = await col()
  const now = new Date()
  const firstUpdate: IncidentUpdate = {
    id: generateUpdateId(),
    status: input.initialStatus,
    body: sanitizeLocalizedInput(input.initialUpdate.body),
    authorId: input.initialUpdate.authorId,
    authorName: input.initialUpdate.authorName,
    createdAt: now,
  }
  const doc = {
    pageId: input.pageId,
    title: sanitizeLocalizedInput(input.title),
    status: input.initialStatus,
    impact: input.impact,
    affectedComponentIds: input.affectedComponentIds,
    source: input.source ?? "manual",
    detectedByCheckId: input.detectedByCheckId ?? null,
    startedAt: now,
    resolvedAt: null,
    updates: [firstUpdate],
    notifiedAt: null,
    postmortem: null,
    postmortemPublishedAt: null,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

/**
 * Yeni timeline update ekle. Status değişirse incident.status da
 * güncellenir; "resolved" olunca resolvedAt set edilir.
 */
export async function appendUpdate(
  id: string,
  update: {
    status: IncidentStatus
    /** Localized body — { tr, en } veya string (string ise her locale'a kopyalanır). */
    body: LocalizedText | string
    authorId: string | null
    authorName: string | null
  },
): Promise<StatusIncident | null> {
  const c = await col()
  const now = new Date()
  const newUpdate: IncidentUpdate = {
    id: generateUpdateId(),
    status: update.status,
    body: sanitizeLocalizedInput(update.body),
    authorId: update.authorId,
    authorName: update.authorName,
    createdAt: now,
  }
  const setFields: Record<string, unknown> = {
    status: update.status,
    updatedAt: now,
  }
  if (update.status === "resolved") {
    setFields.resolvedAt = now
  }
  // MongoDB driver typing $push'u nested type ile çözemiyor (IncidentUpdate
  // schema'sını compile-time bilmiyor). Cast ile geç — runtime davranış
  // standart `$push` semantic'i, side-effect yok.
  const result = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    {
      $push: { updates: newUpdate } as never,
      $set: setFields,
    },
    { returnDocument: "after" },
  )
  return result ? normalizeIncident(result) : null
}

export async function update(
  id: string,
  patch: {
    title?: LocalizedText | string
    impact?: IncidentImpact
    affectedComponentIds?: string[]
  },
): Promise<StatusIncident | null> {
  const c = await col()
  const setFields: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.title !== undefined) setFields.title = sanitizeLocalizedInput(patch.title)
  if (patch.impact !== undefined) setFields.impact = patch.impact
  if (patch.affectedComponentIds !== undefined) {
    setFields.affectedComponentIds = patch.affectedComponentIds
  }
  const result = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    { $set: setFields },
    { returnDocument: "after" },
  )
  return result ? normalizeIncident(result) : null
}

/**
 * Postmortem yaz veya temizle. `null` geçilirse postmortem silinir
 * (publishedAt da null'a düşer).
 */
export async function setPostmortem(
  id: string,
  postmortem: LocalizedText | string | null,
): Promise<StatusIncident | null> {
  const c = await col()
  const now = new Date()
  const setFields: Record<string, unknown> = { updatedAt: now }
  if (postmortem == null) {
    setFields.postmortem = null
    setFields.postmortemPublishedAt = null
  } else {
    setFields.postmortem = sanitizeLocalizedInput(postmortem)
    setFields.postmortemPublishedAt = now
  }
  const result = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    { $set: setFields },
    { returnDocument: "after" },
  )
  return result ? normalizeIncident(result) : null
}

/**
 * Belirli bir update için notifiedAt set et. Worker subscribers'a notify
 * gönderdikten sonra çağırır (duplicate önleme).
 */
export async function markUpdateNotified(
  incidentId: string,
  updateId: string,
): Promise<void> {
  const c = await col()
  await c.updateOne(
    { _id: toObjectId(incidentId), "updates.id": updateId },
    { $set: { "updates.$.notifiedAt": new Date(), updatedAt: new Date() } },
  )
}

export async function markNotified(id: string): Promise<void> {
  const c = await col()
  await c.updateOne(
    { _id: toObjectId(id) },
    { $set: { notifiedAt: new Date(), updatedAt: new Date() } },
  )
}

export async function remove(id: string): Promise<boolean> {
  const c = await col()
  const result = await c.deleteOne({ _id: toObjectId(id) })
  return result.deletedCount === 1
}

export async function removeByPage(pageId: string): Promise<number> {
  const c = await col()
  const r = await c.deleteMany({ pageId })
  return r.deletedCount ?? 0
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ pageId: 1, startedAt: -1 })
  await c.createIndex({ pageId: 1, status: 1 })
  await c.createIndex({ detectedByCheckId: 1 })
}
