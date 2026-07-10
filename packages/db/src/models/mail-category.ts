import { getDb } from "../client"
import { toId } from "./_helpers"

const COLLECTION = "mail_categories"

export const MAIL_CATEGORIES = [
  "promotions",
  "updates",
  "receipts",
  "social",
  "primary",
] as const

export type MailCategory = (typeof MAIL_CATEGORIES)[number]

/**
 * Cached per-message classification produced by the AI categorizer.
 *
 * Scope key: `(companyId, mailbox, uid)`. We deliberately key on the
 * IMAP UID rather than Message-ID because the dashboard already speaks
 * UIDs — looking up by UID lets the categorize endpoint serve a list
 * of messages without an extra Message-ID resolution step.
 *
 * TTL: 60 days. Long enough for the inbox view to stay categorized when
 * a user comes back to old messages; short enough that re-classifying
 * the same message after a model upgrade happens automatically.
 */
export interface MailCategoryDoc {
  id: string
  companyId: string
  mailbox: string
  uid: string
  category: MailCategory
  /** Model identifier (e.g. "google/gemini-2.0-flash") — lets us tell at
   *  a glance whether a re-classification would use a newer model. */
  model: string
  classifiedAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

/** Bulk lookup for a UID set — caller passes the messages it just
 *  loaded, gets back whichever ones are already categorized. */
export async function findByUids(opts: {
  companyId: string
  mailbox: string
  uids: string[]
}): Promise<Map<string, MailCategory>> {
  if (opts.uids.length === 0) return new Map()
  const c = await col()
  const docs = await c
    .find({
      companyId: opts.companyId,
      mailbox: opts.mailbox.toLowerCase(),
      uid: { $in: opts.uids },
    })
    .project({ uid: 1, category: 1 })
    .toArray()
  const map = new Map<string, MailCategory>()
  for (const d of docs) {
    map.set(d.uid as string, d.category as MailCategory)
  }
  return map
}

/**
 * Bulk insert/upsert from a fresh classifier run.
 *
 * Optional `senders` map (uid → fromAddress) is persisted alongside
 * the category so the rules feature can later rewrite every cached
 * classification for a given sender without re-fetching the inbox.
 */
export async function upsertMany(opts: {
  companyId: string
  mailbox: string
  model: string
  classifications: Array<{ uid: string; category: MailCategory }>
  senders?: Record<string, string>
}): Promise<void> {
  if (opts.classifications.length === 0) return
  const c = await col()
  const now = new Date()
  const ops = opts.classifications.map((cls) => {
    const sender = opts.senders?.[cls.uid]?.toLowerCase()
    return {
      updateOne: {
        filter: {
          companyId: opts.companyId,
          mailbox: opts.mailbox.toLowerCase(),
          uid: cls.uid,
        },
        update: {
          $set: {
            category: cls.category,
            model: opts.model,
            classifiedAt: now,
            ...(sender ? { sender } : {}),
          },
        },
        upsert: true,
      },
    }
  })
  await c.bulkWrite(ops, { ordered: false })
}

/**
 * Retroactively rewrite every cached classification whose sender
 * matches a rule. Without this, adding a rule for `noreply@status.io`
 * leaves yesterday's classifications stuck on the AI's old guess
 * until the 60-day TTL expires.
 *
 * `sender` may be a full address (`noreply@status.io`) or a wildcard
 * domain (`@status.io`) — same shape the rules model accepts.
 *
 * Returns the number of rows updated.
 */
export async function overrideBySender(opts: {
  companyId: string
  mailbox: string
  sender: string
  category: MailCategory
  model: string
}): Promise<number> {
  const c = await col()
  const sender = opts.sender.trim().toLowerCase()
  const filter: Record<string, unknown> = {
    companyId: opts.companyId,
    mailbox: opts.mailbox.toLowerCase(),
  }
  if (sender.startsWith("@")) {
    // Wildcard — match every cached row whose sender ends with @domain.
    filter.sender = { $regex: `${escapeRegex(sender)}$` }
  } else {
    filter.sender = sender
  }
  const result = await c.updateMany(filter, {
    $set: {
      category: opts.category,
      model: opts.model,
      classifiedAt: new Date(),
    },
  })
  return result.modifiedCount ?? 0
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Helper used in the categorize endpoint response — surfaces whatever
 *  categories already exist for a UID set as a JSON-friendly array. */
export async function findManyForResponse(opts: {
  companyId: string
  mailbox: string
  uids: string[]
}): Promise<Array<{ uid: string; category: MailCategory }>> {
  const map = await findByUids(opts)
  return [...map.entries()].map(([uid, category]) => ({ uid, category }))
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex(
    { companyId: 1, mailbox: 1, uid: 1 },
    { unique: true },
  )
  // 60-day TTL — old classifications fall off so model upgrades pick
  // up new shipments lazily.
  await c.createIndex(
    { classifiedAt: 1 },
    { expireAfterSeconds: 60 * 86_400 },
  )
}

export { toId }
