import { ObjectId } from "mongodb"
import { getDb } from "../client"

const COLLECTION = "mail_rules"

export const MAIL_RULE_CATEGORIES = [
  "promotions",
  "updates",
  "receipts",
  "social",
  "primary",
] as const

export type MailRuleCategory = (typeof MAIL_RULE_CATEGORIES)[number]

export const MAIL_RULE_KINDS = ["category", "move"] as const
export type MailRuleKind = (typeof MAIL_RULE_KINDS)[number]

/**
 * User-defined sender → action overrides. Two flavors:
 *
 * - `kind: "category"` — pin sender to a virtual category (sidebar
 *   filter). The AI classifier does the heavy lifting on first sight,
 *   but it inevitably gets edge cases wrong (a transactional receipt
 *   that reads like marketing copy, a status-page bot that talks like
 *   a real human). Rules let the user pin a sender to the right bucket
 *   once and have every future message land there without paying for
 *   another classification.
 *
 * - `kind: "move"` — bulk-move existing matches into a real IMAP
 *   folder (e.g. "Newsletters"). Future-message auto-move belongs to
 *   the mail-server (sieve / IDLE worker); this layer only handles
 *   the retroactive sweep at rule-creation time.
 *
 * Match shape: exact email OR `@domain.tld` to catch every address on
 * a domain. Stored lower-cased; compared lower-cased.
 *
 * Scope: `(companyId, mailbox, sender)` unique so the same user can
 * have different rules per inbox account if they want.
 */
export interface MailRuleDoc {
  id: string
  companyId: string
  mailbox: string
  /** Lower-cased: `noreply@statuspage.io` or `@statuspage.io`. */
  sender: string
  kind: MailRuleKind
  /** Set when kind === "category". */
  category: MailRuleCategory | null
  /** Set when kind === "move" (IMAP folder path). */
  targetFolder: string | null
  createdAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

function normSender(input: string): string {
  return input.trim().toLowerCase()
}

/**
 * Hydrate a raw Mongo doc into a typed `MailRuleDoc`. Pre-`kind` rows
 * (written before the move-action shipped) carried only `category` and
 * implicitly meant `kind: "category"` — keep them readable so the
 * sidebar/categorize path still finds them after the migration.
 */
function fromDoc(d: Record<string, unknown>): MailRuleDoc {
  const rawKind = d.kind as MailRuleKind | undefined
  const kind: MailRuleKind = rawKind === "move" ? "move" : "category"
  const category =
    kind === "category" ? ((d.category as MailRuleCategory) ?? null) : null
  const targetFolder =
    kind === "move" ? ((d.targetFolder as string | null) ?? null) : null
  return {
    id: (d._id as { toString(): string }).toString(),
    companyId: d.companyId as string,
    mailbox: d.mailbox as string,
    sender: d.sender as string,
    kind,
    category,
    targetFolder,
    createdAt: d.createdAt as Date,
  }
}

export async function listForMailbox(opts: {
  companyId: string
  mailbox: string
}): Promise<MailRuleDoc[]> {
  const c = await col()
  const docs = await c
    .find({
      companyId: opts.companyId,
      mailbox: opts.mailbox.toLowerCase(),
    })
    .sort({ createdAt: -1 })
    .toArray()
  return docs.map((d) => fromDoc(d as Record<string, unknown>))
}

export async function add(opts: {
  companyId: string
  mailbox: string
  sender: string
  kind: MailRuleKind
  category?: MailRuleCategory | null
  targetFolder?: string | null
}): Promise<MailRuleDoc> {
  if (opts.kind === "category" && !opts.category) {
    throw new Error("category is required when kind is 'category'")
  }
  if (opts.kind === "move" && !opts.targetFolder) {
    throw new Error("targetFolder is required when kind is 'move'")
  }
  const c = await col()
  const now = new Date()
  const mailbox = opts.mailbox.toLowerCase()
  const sender = normSender(opts.sender)
  const category = opts.kind === "category" ? opts.category! : null
  const targetFolder = opts.kind === "move" ? opts.targetFolder!.trim() : null
  // Upsert so re-pinning the same sender just rotates the action.
  // Clear the inactive field on the way in — switching a sender from
  // category to move (or vice versa) shouldn't leave a stale value.
  const result = await c.findOneAndUpdate(
    {
      companyId: opts.companyId,
      mailbox,
      sender,
    },
    {
      $set: {
        kind: opts.kind,
        category,
        targetFolder,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true, returnDocument: "after" },
  )
  return {
    id: result!._id.toString(),
    companyId: opts.companyId,
    mailbox,
    sender,
    kind: opts.kind,
    category,
    targetFolder,
    createdAt: (result!.createdAt as Date) ?? now,
  }
}

export async function remove(opts: {
  companyId: string
  ruleId: string
}): Promise<void> {
  const c = await col()
  await c.deleteOne({
    _id: new ObjectId(opts.ruleId),
    companyId: opts.companyId,
  })
}

/**
 * Resolve a sender to a rule category if a matching `kind === "category"`
 * rule exists. Tries the exact address first, then the domain wildcard
 * (`@example.com`). Returns `null` when nothing matches — caller falls
 * back to the AI classifier.
 *
 * Move-rules are intentionally ignored here: the classifier only deals
 * with virtual categories. Move actions are applied at rule-creation
 * time (retroactive sweep) and — eventually — by the mail-server's
 * own sieve/IDLE worker for new arrivals.
 */
export function findCategory(
  rules: Pick<MailRuleDoc, "sender" | "category" | "kind">[],
  fromAddress: string,
): MailRuleCategory | null {
  const addr = fromAddress.trim().toLowerCase()
  if (!addr) return null
  const categoryRules = rules.filter(
    (r) => r.kind === "category" && r.category,
  )
  const exact = categoryRules.find((r) => r.sender === addr)
  if (exact) return exact.category
  const at = addr.lastIndexOf("@")
  if (at < 0) return null
  const domain = addr.slice(at)
  const wild = categoryRules.find((r) => r.sender === domain)
  return wild?.category ?? null
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex(
    { companyId: 1, mailbox: 1, sender: 1 },
    { unique: true },
  )
  await c.createIndex({ companyId: 1, mailbox: 1 })
}
