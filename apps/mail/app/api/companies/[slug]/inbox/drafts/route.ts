import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import {
  getSentroyForInbox,
  statusFromMailServerError,
} from "@/lib/inbox-access"

interface DraftBody {
  mailbox?: string
  from?: string
  to?: string | string[]
  cc?: string | string[]
  replyTo?: string | string[]
  subject?: string
  html?: string
  text?: string
  inReplyTo?: string
  references?: string[]
  headers?: Record<string, string>
  attachments?: Array<{
    filename: string
    content: string
    contentType?: string
  }>
}

// Mail-server-sdk's `inbox.saveDraft` ships in a release after 1.0.16,
// so we can't statically depend on it yet. We hit the upstream HTTP
// endpoint directly with the company's `sentroyApiKey` — same auth as
// the SDK uses internally — and return the response verbatim. Once the
// SDK bump lands the body of this route can become a one-liner.
const MAIL_SERVER_BASE = (
  process.env.SENTROY_MAIL_API_URL ||
  process.env.NEXT_PUBLIC_SENTROY_API_URL ||
  "http://localhost:3000/api/v1"
).replace(/\/$/, "")

const MAIL_SERVER_API = MAIL_SERVER_BASE.endsWith("/api/v1")
  ? MAIL_SERVER_BASE
  : `${MAIL_SERVER_BASE}/api/v1`

/**
 * Save a compose draft into the user's IMAP `\\Drafts` folder via the
 * mail-server. The mail-server builds RFC 822 from this payload so the
 * draft is visible in any IMAP client (Apple Mail, mobile, Outlook),
 * not just the Sentroy dashboard. Replaces the localStorage-only flow
 * for cross-device durability.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  let body: DraftBody
  try {
    body = (await request.json()) as DraftBody
  } catch {
    return jsonError("Invalid JSON body")
  }

  const mailbox = (body.mailbox || body.from || "").toString().trim()
  if (!mailbox) {
    return jsonError("mailbox or from is required", 400)
  }

  const result = await getSentroyForInbox(request, slug, mailbox)
  if ("error" in result && result.error) return result.error

  // Pull the company's mail-server API key from the resolved sentroy
  // proxy result. The SDK already knows it; we re-use it for the raw
  // fetch so the inbox-access permission gate stays the single source
  // of truth for "who can write to this mailbox".
  const apiKey =
    (result.company as { sentroyApiKey?: string } | undefined)
      ?.sentroyApiKey || ""
  if (!apiKey) {
    return jsonError("Mail server not provisioned", 502)
  }

  try {
    const upstream = await fetch(`${MAIL_SERVER_API}/inbox/drafts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      body: JSON.stringify({ ...body, mailbox }),
    })
    const text = await upstream.text()
    let json: { data?: unknown; error?: string }
    try {
      json = text ? JSON.parse(text) : {}
    } catch {
      // Defensive — mirrors the parse-guard the SDK now does so a
      // gateway 502 page doesn't surface as "Unexpected token".
      return jsonError(
        text.trim().slice(0, 160) || "Mail server non-JSON response",
        upstream.status || 502,
      )
    }
    if (!upstream.ok) {
      return jsonError(
        json.error ?? `HTTP ${upstream.status}`,
        upstream.status,
      )
    }
    return jsonSuccess(json.data ?? { message: "Draft saved" }, 201)
  } catch (err: unknown) {
    return jsonError(
      err instanceof Error ? err.message : "Failed to save draft",
      statusFromMailServerError(err),
    )
  }
}
