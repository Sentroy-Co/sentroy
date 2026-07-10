import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "auth_project_mail_templates"

/**
 * Per-project mail template override. Default'ları `auth-project-mail-events.ts`
 * registry'sinde tanımlı; RP istediği eventKey için subject/body'yi
 * override edebilir. Override yoksa default render edilir.
 *
 * subject + htmlBody {tr, en} LocalizedString. Override yazılırken her iki
 * locale gönderilmek zorunda değil — eksik olanlar default'a fallback.
 */

export interface AuthProjectMailTemplate {
  id: string
  authProjectId: string
  eventKey: string
  subject: { tr?: string; en?: string }
  htmlBody: { tr?: string; en?: string }
  enabled: boolean
  createdAt: Date
  updatedAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function findByEvent(
  authProjectId: string,
  eventKey: string,
): Promise<AuthProjectMailTemplate | null> {
  const c = await col()
  const doc = await c.findOne({ authProjectId, eventKey })
  return doc ? toId(doc) : null
}

export async function listByProject(
  authProjectId: string,
): Promise<AuthProjectMailTemplate[]> {
  const c = await col()
  const docs = await c.find({ authProjectId }).toArray()
  return docs.map((d) => toId(d) as AuthProjectMailTemplate)
}

/**
 * Upsert — varsa update, yoksa create. Aynı (authProjectId, eventKey)
 * için tek kayıt.
 */
export async function upsert(input: {
  authProjectId: string
  eventKey: string
  subject?: { tr?: string; en?: string }
  htmlBody?: { tr?: string; en?: string }
  enabled?: boolean
}): Promise<AuthProjectMailTemplate> {
  const c = await col()
  const now = new Date()
  await c.updateOne(
    { authProjectId: input.authProjectId, eventKey: input.eventKey },
    {
      $set: {
        subject: input.subject ?? {},
        htmlBody: input.htmlBody ?? {},
        enabled: input.enabled ?? true,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  )
  const doc = await c.findOne({
    authProjectId: input.authProjectId,
    eventKey: input.eventKey,
  })
  return toId(doc) as AuthProjectMailTemplate
}

export async function remove(
  authProjectId: string,
  eventKey: string,
): Promise<boolean> {
  const c = await col()
  const r = await c.deleteOne({ authProjectId, eventKey })
  return (r.deletedCount ?? 0) > 0
}

export async function removeByProject(
  authProjectId: string,
): Promise<number> {
  const c = await col()
  const r = await c.deleteMany({ authProjectId })
  return r.deletedCount ?? 0
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex(
    { authProjectId: 1, eventKey: 1 },
    { unique: true },
  )
}
