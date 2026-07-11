export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForInbox } from "@/lib/inbox-access"
import { mailCategoryModel, mailRuleModel } from "@workspace/db/models"
import { findCategory } from "@workspace/db/models/mail-rule"
import {
  mailClassifyTask,
  type MailClassifyMessage,
} from "@workspace/ai-assistant/tasks/mail-classify"
import { runAssistant, AssistantError, DEFAULT_MODEL_ID } from "@workspace/ai-assistant/assistant"

const MAX_BATCH = 30
const PREVIEW_CAP = 240

interface InputMessage {
  uid: string
  subject?: string
  fromName?: string | null
  fromAddress: string
  preview?: string | null
  hasListUnsubscribe?: boolean
}

/**
 * Lazy classifier endpoint — the inbox UI hands its current message
 * window in, we return a `{ uid, category }` map. Already-classified
 * UIDs come straight from `mail_categories`; uncached ones are batched
 * to Gemini 2.0 Flash via the AI Gateway, then persisted so the next
 * call (or the next session) is free.
 *
 * Cost shape with default settings: a 30-message classification call
 * lands ~5k input + 200 output tokens at ~$0.0005 per call. With the
 * 60-day TTL most users only pay this on first view.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  let body: { mailbox?: string; messages?: InputMessage[] }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (!body.mailbox) return jsonError("mailbox is required")
  if (Array.isArray(body.messages) && body.messages.length > MAX_BATCH) {
    return jsonError(`Maximum ${MAX_BATCH} messages per batch`, 422)
  }

  // Auth gate — even an empty payload should fail closed if the caller
  // can't see this mailbox. The cheap "0 / 0" response we'd otherwise
  // return is small, but we don't want unauthenticated probes warming
  // up the AI gateway path.
  const result = await getSentroyForInbox(request, slug, body.mailbox)
  if ("error" in result && result.error) return result.error
  const companyId = result.companyId
  if (!companyId) return jsonError("Company not resolved", 500)

  const messages = Array.isArray(body.messages) ? body.messages : []
  const validMessages = messages.filter(
    (m): m is InputMessage =>
      typeof m?.uid === "string" &&
      m.uid.length > 0 &&
      typeof m.fromAddress === "string",
  )
  if (validMessages.length === 0) {
    return jsonSuccess({ classifications: [], cached: 0, classified: 0 })
  }

  const mailbox = body.mailbox.toLowerCase()
  const uids = validMessages.map((m) => m.uid)

  // 0. Rules pass — user-pinned senders override everything (including
  //    a stale cache from before the rule was added). We classify
  //    these locally without spending an AI token, persist them so the
  //    next request hits the cache, and short-circuit them out of the
  //    AI batch below.
  const rules = await mailRuleModel.listForMailbox({ companyId, mailbox })
  // Only category-rules participate in classification — move-rules are
  // applied retroactively at create time and (eventually) by the
  // mail-server's own auto-apply path. Filter here too so a missing
  // `category` field on a move-rule never confuses the loop below.
  const rulePairs = rules.map((r) => ({
    sender: r.sender,
    category: r.category,
    kind: r.kind,
  }))
  const ruleMatches: Array<{ uid: string; category: string; sender: string }> = []
  for (const m of validMessages) {
    const cat = findCategory(rulePairs, m.fromAddress)
    if (cat) ruleMatches.push({ uid: m.uid, category: cat, sender: m.fromAddress.toLowerCase() })
  }
  if (ruleMatches.length > 0) {
    try {
      await mailCategoryModel.upsertMany({
        companyId,
        mailbox,
        model: "user-rule",
        classifications: ruleMatches.map((r) => ({
          uid: r.uid,
          category: r.category as never,
        })),
        senders: Object.fromEntries(ruleMatches.map((r) => [r.uid, r.sender])),
      })
    } catch {
      // Best-effort persist; the in-memory hits below still work.
    }
  }
  const ruleClassified = new Map(ruleMatches.map((r) => [r.uid, r.category]))

  // 1. Cache hit pass — anything we've classified before comes back
  //    immediately. The map keeps the client/server contract tight: a
  //    single dictionary the UI merges into local state.
  const cached = await mailCategoryModel.findByUids({
    companyId,
    mailbox,
    uids,
  })

  const uncached = validMessages.filter(
    (m) => !cached.has(m.uid) && !ruleClassified.has(m.uid),
  )

  // Surface what we already know — even if Gemini fails below the user
  // still sees their cached classifications. Rule matches override
  // both cache and AI: pin wins.
  const classifications: Array<{ uid: string; category: string }> = []
  for (const [uid, category] of cached.entries()) {
    if (ruleClassified.has(uid)) continue
    classifications.push({ uid, category })
  }
  for (const [uid, category] of ruleClassified.entries()) {
    classifications.push({ uid, category })
  }

  if (uncached.length === 0) {
    return jsonSuccess({
      classifications,
      cached: cached.size,
      classified: 0,
      rules: ruleMatches.length,
    })
  }

  // 2. Cache miss pass — feed the rest to the classifier. We cap
  //    `preview` here too in case the caller forgot to.
  const classifyInput: MailClassifyMessage[] = uncached.map((m) => ({
    uid: m.uid,
    subject: m.subject ?? "",
    fromName: m.fromName ?? null,
    fromAddress: m.fromAddress,
    preview: m.preview ? m.preview.slice(0, PREVIEW_CAP) : null,
    hasListUnsubscribe: m.hasListUnsubscribe ?? false,
  }))

  try {
    const run = await runAssistant({
      task: mailClassifyTask,
      input: { messages: classifyInput },
    })

    // Defensive — model can occasionally drop a UID; only persist the
    // ones it actually returned, the rest stay uncached and the UI
    // will retry on its next batch.
    const fresh = run.output.classifications.filter((c) =>
      classifyInput.some((m) => m.uid === c.uid),
    )

    if (fresh.length > 0) {
      await mailCategoryModel.upsertMany({
        companyId,
        mailbox,
        model: DEFAULT_MODEL_ID,
        classifications: fresh,
        // Persist sender alongside the category so a future "always
        // categorize this sender as X" rule can rewrite cached rows
        // without re-fetching the inbox.
        senders: Object.fromEntries(
          uncached.map((m) => [m.uid, m.fromAddress.toLowerCase()]),
        ),
      })
      for (const c of fresh) {
        classifications.push({ uid: c.uid, category: c.category })
      }
    }

    return jsonSuccess({
      classifications,
      cached: cached.size,
      classified: fresh.length,
      rules: ruleMatches.length,
    })
  } catch (err) {
    // Cached results are still useful even on classifier failure — we
    // return them with a 200 so the UI degrades gracefully rather than
    // showing every old classification as "loading".
    if (err instanceof AssistantError && err.code === "missing-api-key") {
      return jsonError(
        "AI gateway is not configured (set AI_GATEWAY_API_KEY)",
        503,
      )
    }
    return jsonSuccess(
      {
        classifications,
        cached: cached.size,
        classified: 0,
        rules: ruleMatches.length,
        error: err instanceof Error ? err.message : "Classifier failed",
      },
      207,
    )
  }
}
