import { getDb } from "../client"
import { toId } from "./_helpers"
import type {
  SystemMailEventTemplate,
  LocalizedString,
} from "../types/system-mail-event-template"

/**
 * Override store for transactional system mail events.
 *
 * One document per `eventKey` (unique). DB miss == "use code defaults"
 * — that's the reset-to-default semantic. Listing returns all overrides
 * regardless of which events are currently in the registry; the API
 * layer joins this with the registry to compute the visible list.
 */

const COLLECTION = "system_mail_event_templates"

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function findByKey(
  eventKey: string,
): Promise<SystemMailEventTemplate | null> {
  const c = await col()
  const doc = await c.findOne({ eventKey })
  return toId(doc) as SystemMailEventTemplate | null
}

export async function listAll(): Promise<SystemMailEventTemplate[]> {
  const c = await col()
  const docs = await c.find({}).sort({ updatedAt: -1 }).toArray()
  return docs.map(toId) as SystemMailEventTemplate[]
}

export async function upsertByKey(
  eventKey: string,
  data: {
    subject: LocalizedString
    htmlBody: LocalizedString
    enabled?: boolean
    updatedBy?: string | null
  },
): Promise<SystemMailEventTemplate> {
  const c = await col()
  const now = new Date()
  await c.updateOne(
    { eventKey },
    {
      $set: {
        eventKey,
        subject: data.subject,
        htmlBody: data.htmlBody,
        enabled: data.enabled ?? true,
        updatedBy: data.updatedBy ?? null,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  )
  const doc = await c.findOne({ eventKey })
  return toId(doc) as SystemMailEventTemplate
}

export async function deleteByKey(eventKey: string): Promise<boolean> {
  const c = await col()
  const result = await c.deleteOne({ eventKey })
  return result.deletedCount === 1
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ eventKey: 1 }, { unique: true })
}
