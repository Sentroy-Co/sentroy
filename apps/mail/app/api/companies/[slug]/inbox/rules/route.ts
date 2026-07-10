import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForInbox } from "@/lib/inbox-access"
import {
  mailRuleModel,
  mailCategoryModel,
} from "@workspace/db/models"
import {
  MAIL_RULE_CATEGORIES,
  MAIL_RULE_KINDS,
  type MailRuleCategory,
  type MailRuleKind,
} from "@workspace/db/models/mail-rule"

const VALID_CATEGORIES = new Set<string>(MAIL_RULE_CATEGORIES)
const VALID_KINDS = new Set<string>(MAIL_RULE_KINDS)

/**
 * How deep we sweep INBOX when applying a fresh move-rule. The point
 * is "everything I can already see in the UI", not "every message in
 * the mailbox" — anything older than this didn't motivate the user to
 * write the rule in the first place. Bumping this is cheap (one IMAP
 * fetch + N moves) but slow on large mailboxes.
 */
const MOVE_SWEEP_LIMIT = 300

function senderMatches(messageFrom: string, ruleSender: string): boolean {
  const addr = messageFrom.trim().toLowerCase()
  if (!addr) return false
  if (ruleSender.startsWith("@")) {
    return addr.endsWith(ruleSender)
  }
  return addr === ruleSender
}

/** Sender → category override list scoped to a mailbox. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const mailbox = request.nextUrl.searchParams.get("mailbox") || undefined
  if (!mailbox) return jsonError("mailbox is required", 400)

  const result = await getSentroyForInbox(request, slug, mailbox)
  if ("error" in result && result.error) return result.error
  if (!result.companyId) return jsonError("Company not resolved", 500)

  const rules = await mailRuleModel.listForMailbox({
    companyId: result.companyId,
    mailbox,
  })
  return jsonSuccess({ items: rules })
}

/**
 * Pin a sender to either a category (virtual sidebar bucket) or a
 * folder move (real IMAP move into a user-defined folder).
 *
 * Body:
 *   { mailbox, sender, kind: "category", category: <MailRuleCategory> }
 *   { mailbox, sender, kind: "move",     targetFolder: "Newsletters" }
 *
 * Both kinds re-apply retroactively at create time so the user sees an
 * immediate effect:
 *   - category → rewrite every cached classification for this sender
 *     (otherwise the AI's old guess sticks until the 60-day cache TTL).
 *   - move → walk the most recent INBOX page and IMAP-move every
 *     message matching the sender into the target folder. Future
 *     auto-move belongs to a mail-server worker (sieve / IDLE) and is
 *     not in scope here — the response surfaces this so the UI can
 *     show a "future not auto-moved yet" hint.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  let body: {
    mailbox?: string
    sender?: string
    kind?: string
    category?: string
    targetFolder?: string
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const mailbox = body.mailbox?.toLowerCase().trim() || ""
  const sender = body.sender?.toLowerCase().trim() || ""
  // Default to "category" so SDK callers built before the move-action
  // shipped keep working unchanged.
  const kind = (body.kind ?? "category") as MailRuleKind

  if (!mailbox) return jsonError("mailbox is required", 400)
  if (!sender) return jsonError("sender is required", 400)
  if (!VALID_KINDS.has(kind)) {
    return jsonError(
      `kind must be one of: ${[...MAIL_RULE_KINDS].join(", ")}`,
      400,
    )
  }

  let category: MailRuleCategory | null = null
  let targetFolder: string | null = null

  if (kind === "category") {
    if (!body.category || !VALID_CATEGORIES.has(body.category)) {
      return jsonError(
        `category must be one of: ${[...MAIL_RULE_CATEGORIES].join(", ")}`,
        400,
      )
    }
    category = body.category as MailRuleCategory
  } else {
    if (!body.targetFolder || !body.targetFolder.trim()) {
      return jsonError("targetFolder is required when kind is 'move'", 400)
    }
    targetFolder = body.targetFolder.trim()
  }

  const result = await getSentroyForInbox(request, slug, mailbox)
  if ("error" in result && result.error) return result.error
  if (!result.companyId) return jsonError("Company not resolved", 500)

  const rule = await mailRuleModel.add({
    companyId: result.companyId,
    mailbox,
    sender,
    kind,
    category,
    targetFolder,
  })

  let updated = 0
  let moved = 0
  let moveError: string | null = null

  if (kind === "category" && category) {
    // Retroactive apply: rewrite every cached classification whose
    // sender matches this rule. Without this the user adds a rule but
    // existing messages still show up under the AI's old guess until
    // the cache TTL expires (60 days).
    try {
      updated = await mailCategoryModel.overrideBySender({
        companyId: result.companyId,
        mailbox,
        sender,
        category,
        model: "user-rule",
      })
    } catch {
      // Cache override is best-effort — the rule itself is saved either way.
    }
  } else if (kind === "move" && targetFolder) {
    // Retroactive sweep: pull the most recent INBOX page and bulk-move
    // anything matching the sender. We cap at MOVE_SWEEP_LIMIT to keep
    // the request bounded; the IDLE/sieve worker (mail-server epic)
    // will eventually handle older messages and future arrivals.
    try {
      const list = await result.sentroy!.inbox.list({
        mailbox,
        folder: "INBOX",
        limit: MOVE_SWEEP_LIMIT,
      })
      const candidates = (list.data ?? []).filter((m) => {
        const from =
          (m as unknown as { fromAddress?: string }).fromAddress ?? ""
        return senderMatches(from, sender)
      })
      // Sequential — IMAP MOVE renumbers UIDs as it goes; parallel
      // calls would race against the same IMAP session and lose
      // messages. The cap keeps the worst case under a few seconds.
      for (const m of candidates) {
        const uid = (m as unknown as { uid?: number | string }).uid
        if (uid === undefined || uid === null) continue
        try {
          await result.sentroy!.inbox.move(
            Number(uid),
            targetFolder,
            "INBOX",
            mailbox,
          )
          moved += 1
        } catch {
          // One failed move shouldn't kill the whole sweep — keep going
          // and report the partial count.
        }
      }
    } catch (err: unknown) {
      moveError = err instanceof Error ? err.message : "Sweep failed"
    }
  }

  return jsonSuccess(
    {
      rule,
      updated,
      moved,
      moveError,
      // UI hint: future arrivals are not auto-moved yet (mail-server
      // sieve worker pending). Surface this so the sheet can show a
      // small "applies to existing only" warning.
      futureAutoApply: false,
    },
    201,
  )
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const ruleId = request.nextUrl.searchParams.get("ruleId")
  const mailbox = request.nextUrl.searchParams.get("mailbox") || undefined
  if (!ruleId) return jsonError("ruleId is required", 400)

  const result = await getSentroyForInbox(request, slug, mailbox)
  if ("error" in result && result.error) return result.error
  if (!result.companyId) return jsonError("Company not resolved", 500)

  await mailRuleModel.remove({ companyId: result.companyId, ruleId })
  return jsonSuccess({ message: "Rule removed" })
}
