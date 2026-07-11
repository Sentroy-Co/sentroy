export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForInbox } from "@/lib/inbox-access"
import { getDb } from "@workspace/db/client"

/**
 * Preview the impact of a rule before the user commits to it. Counts
 * how many already-classified messages from this sender exist in the
 * cache so the UI can say "this rule will reclassify 7 messages" — a
 * lot less surprising than tapping Save and watching the sidebar
 * filter shuffle.
 *
 * Limited to cached classifications: messages the user hasn't opened
 * the inbox for yet aren't visible to us anyway, and counting those
 * would require a fresh IMAP fetch (heavy, slow, mostly redundant
 * because the next inbox load classifies + applies the rule together).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  let body: { mailbox?: string; sender?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const mailbox = body.mailbox?.toLowerCase().trim() || ""
  const sender = body.sender?.toLowerCase().trim() || ""
  if (!mailbox) return jsonError("mailbox is required", 400)
  if (!sender) return jsonError("sender is required", 400)

  const result = await getSentroyForInbox(request, slug, mailbox)
  if ("error" in result && result.error) return result.error
  if (!result.companyId) return jsonError("Company not resolved", 500)

  const db = await getDb()
  const filter: Record<string, unknown> = {
    companyId: result.companyId,
    mailbox,
  }
  if (sender.startsWith("@")) {
    // Wildcard — count every cached row whose sender ends with @domain.
    const escaped = sender.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    filter.sender = { $regex: `${escaped}$` }
  } else {
    filter.sender = sender
  }
  const matched = await db.collection("mail_categories").countDocuments(filter)
  return jsonSuccess({ matched })
}
