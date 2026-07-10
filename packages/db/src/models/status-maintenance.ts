import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"
import {
  type LocalizedText,
  normalizeLocalized,
  sanitizeLocalizedInput,
} from "../types/localized"

const COLLECTION = "status_maintenances"

/**
 * Status Maintenance — planlı bakım pencereleri. Public page'de
 * "Scheduled maintenance" sekmesinde gelecek bakımlar listelenir;
 * `scheduledStart` geçince banner'a düşer; `scheduledEnd` sonrası
 * "completed" olur.
 *
 * Maintenance pencereleri sırasında etkilenen component'lerin status'u
 * UI'da "under_maintenance" gösterilir (downtime sayılmaz, uptime
 * istatistik'i etkilenmez).
 *
 * Subscriber notification: 1 saat öncesinden (Phase 8'de email).
 */

export type MaintenanceStatus =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled"

export interface StatusMaintenance {
  id: string
  pageId: string
  /** Localized title ({ tr, en }) — public-facing. */
  title: LocalizedText
  /** Localized description ({ tr, en }) — markdown. Beklenen impact, plan, etc. */
  description: LocalizedText
  /** Etkilenen component id'leri. */
  affectedComponentIds: string[]
  scheduledStart: Date
  scheduledEnd: Date
  /** Gerçek başlama (UI'da "in_progress" işaretlendiğinde set). */
  actualStart: Date | null
  actualEnd: Date | null
  status: MaintenanceStatus
  /** Subscriber notify gönderildi mi (1 saat öncesinden). */
  notifiedReminder: boolean
  notifiedStarted: boolean
  notifiedCompleted: boolean
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

function normalizeMaintenance(doc: Record<string, unknown>): StatusMaintenance {
  const base = toId(doc) as StatusMaintenance & {
    title: unknown
    description: unknown
  }
  base.title = normalizeLocalized(base.title)
  base.description = normalizeLocalized(base.description)
  return base as StatusMaintenance
}

// ─── Queries ──────────────────────────────────────────────────────────────

export async function findById(id: string): Promise<StatusMaintenance | null> {
  const c = await col()
  const doc = await c.findOne({ _id: toObjectId(id) })
  return doc ? normalizeMaintenance(doc) : null
}

export async function findUpcomingByPage(
  pageId: string,
  opts: { limit?: number } = {},
): Promise<StatusMaintenance[]> {
  const c = await col()
  const docs = await c
    .find({
      pageId,
      scheduledStart: { $gte: new Date() },
      status: { $in: ["scheduled", "in_progress"] },
    })
    .sort({ scheduledStart: 1 })
    .limit(opts.limit ?? 25)
    .toArray()
  return docs.map((d) => normalizeMaintenance(d))
}

export async function findActiveByPage(
  pageId: string,
): Promise<StatusMaintenance[]> {
  const c = await col()
  const now = new Date()
  const docs = await c
    .find({
      pageId,
      scheduledStart: { $lte: now },
      scheduledEnd: { $gte: now },
      status: { $in: ["scheduled", "in_progress"] },
    })
    .toArray()
  return docs.map((d) => normalizeMaintenance(d))
}

/**
 * Cross-page — bildirim notify edilmemiş + reminder window'una giren
 * scheduled maintenance'lar. Worker her tick'inde bu listeyi tarar.
 */
export async function findPendingNotifyAllPages(
  windowMs: number = 60 * 60 * 1000,
): Promise<StatusMaintenance[]> {
  const c = await col()
  const now = new Date()
  const reminderWindow = new Date(now.getTime() + windowMs)
  // Üç kategori birleşik query:
  //   - reminder: scheduledStart <= now + window AND scheduledStart > now AND notifiedReminder false
  //   - started: status in_progress AND notifiedStarted false
  //   - completed: status completed AND notifiedCompleted false
  const docs = await c
    .find({
      $or: [
        {
          status: "scheduled",
          scheduledStart: { $gt: now, $lte: reminderWindow },
          notifiedReminder: false,
        },
        { status: "in_progress", notifiedStarted: false },
        { status: "completed", notifiedCompleted: false },
      ],
    })
    .toArray()
  return docs.map((d) => normalizeMaintenance(d))
}

export async function findRecentByPage(
  pageId: string,
  opts: { limit?: number; skip?: number } = {},
): Promise<StatusMaintenance[]> {
  const c = await col()
  const docs = await c
    .find({ pageId })
    .sort({ scheduledStart: -1 })
    .skip(opts.skip ?? 0)
    .limit(opts.limit ?? 25)
    .toArray()
  return docs.map((d) => normalizeMaintenance(d))
}

// ─── Mutations ────────────────────────────────────────────────────────────

export async function create(input: {
  pageId: string
  title: LocalizedText | string
  description: LocalizedText | string
  affectedComponentIds: string[]
  scheduledStart: Date
  scheduledEnd: Date
  createdBy: string
}): Promise<StatusMaintenance> {
  const c = await col()
  if (input.scheduledEnd <= input.scheduledStart) {
    throw new Error("scheduledEnd must be after scheduledStart")
  }
  const now = new Date()
  const doc = {
    pageId: input.pageId,
    title: sanitizeLocalizedInput(input.title),
    description: sanitizeLocalizedInput(input.description),
    affectedComponentIds: input.affectedComponentIds,
    scheduledStart: input.scheduledStart,
    scheduledEnd: input.scheduledEnd,
    actualStart: null,
    actualEnd: null,
    status: "scheduled" as const,
    notifiedReminder: false,
    notifiedStarted: false,
    notifiedCompleted: false,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

export async function update(
  id: string,
  patch: {
    title?: LocalizedText | string
    description?: LocalizedText | string
    affectedComponentIds?: string[]
    scheduledStart?: Date
    scheduledEnd?: Date
  },
): Promise<StatusMaintenance | null> {
  const c = await col()
  const setFields: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.title !== undefined) setFields.title = sanitizeLocalizedInput(patch.title)
  if (patch.description !== undefined) {
    setFields.description = sanitizeLocalizedInput(patch.description)
  }
  if (patch.affectedComponentIds !== undefined) {
    setFields.affectedComponentIds = patch.affectedComponentIds
  }
  if (patch.scheduledStart !== undefined) setFields.scheduledStart = patch.scheduledStart
  if (patch.scheduledEnd !== undefined) setFields.scheduledEnd = patch.scheduledEnd
  const result = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    { $set: setFields },
    { returnDocument: "after" },
  )
  return result ? normalizeMaintenance(result) : null
}

export async function transitionStatus(
  id: string,
  status: MaintenanceStatus,
): Promise<StatusMaintenance | null> {
  const c = await col()
  const now = new Date()
  const setFields: Record<string, unknown> = { status, updatedAt: now }
  if (status === "in_progress") setFields.actualStart = now
  if (status === "completed" || status === "cancelled") setFields.actualEnd = now
  const result = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    { $set: setFields },
    { returnDocument: "after" },
  )
  return result ? normalizeMaintenance(result) : null
}

export async function markNotified(
  id: string,
  type: "reminder" | "started" | "completed",
): Promise<void> {
  const c = await col()
  const setKey =
    type === "reminder"
      ? "notifiedReminder"
      : type === "started"
        ? "notifiedStarted"
        : "notifiedCompleted"
  await c.updateOne(
    { _id: toObjectId(id) },
    { $set: { [setKey]: true, updatedAt: new Date() } },
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
  await c.createIndex({ pageId: 1, scheduledStart: -1 })
  await c.createIndex({ pageId: 1, status: 1, scheduledStart: 1 })
}
