import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForInbox } from "@/lib/inbox-access"

const TIMEOUT_MS = 8_000
const ALLOWED_SCHEMES = new Set(["http:", "https:"])
const MAX_BODY_PREVIEW = 1024

/**
 * RFC 8058 one-click unsubscribe proxy. The browser can't safely
 * cross-origin POST to a sender's unsubscribe endpoint (CORS, mixed
 * content), so the dashboard hands the URL to this endpoint and the
 * server fires the canonical
 *
 *   POST <url>
 *   Content-Type: application/x-www-form-urlencoded
 *
 *   List-Unsubscribe=One-Click
 *
 * request, then returns a small status envelope to the UI. We only
 * accept http(s) — `mailto:` unsubscribes still go through the existing
 * client-side `window.location.href` path because they need the user's
 * mail client.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; uid: string }> },
) {
  const { slug } = await params

  let body: { url?: string; mailbox?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const target = (body.url || "").trim()
  if (!target) return jsonError("url is required")

  let parsed: URL
  try {
    parsed = new URL(target)
  } catch {
    return jsonError("Invalid URL")
  }
  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    return jsonError("Only http and https URLs are allowed", 422)
  }

  // Permission gate matches the rest of the inbox surface — viewing
  // the message is enough; we don't require a separate scope to act on
  // its List-Unsubscribe header.
  const result = await getSentroyForInbox(request, slug, body.mailbox)
  if ("error" in result && result.error) return result.error

  let status = 0
  let statusText = ""
  let responseBody = ""
  let errorMessage: string | undefined

  try {
    const res = await fetch(parsed.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Sentroy-Unsubscribe/1.0 (RFC 8058)",
      },
      body: "List-Unsubscribe=One-Click",
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    status = res.status
    statusText = res.statusText
    try {
      responseBody = (await res.text()).slice(0, MAX_BODY_PREVIEW)
    } catch {
      responseBody = ""
    }
    if (!res.ok) errorMessage = `HTTP ${res.status}`
  } catch (err) {
    errorMessage =
      err instanceof Error
        ? err.name === "TimeoutError"
          ? `Timed out after ${TIMEOUT_MS}ms`
          : err.message
        : "Request failed"
  }

  // Many senders return non-2xx but actually unsubscribe — we surface
  // the raw status so the UI can show "Sent (HTTP 302)" instead of
  // hiding the outcome.
  return jsonSuccess({
    status,
    statusText,
    responseBody,
    ok: status >= 200 && status < 400,
    ...(errorMessage ? { error: errorMessage } : {}),
  })
}
