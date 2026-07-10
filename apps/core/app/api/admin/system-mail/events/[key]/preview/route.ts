import { NextRequest } from "next/server"
import {
  jsonError,
  jsonSuccess,
  getAuthSession,
} from "@workspace/console/lib/api-helpers"
import {
  getSystemMailEvent,
  renderSystemMailEvent,
} from "@workspace/auth/server/system-mail-events"

/**
 * Render an event with sample variables for the editor's live preview.
 *
 * The body lets the admin:
 *   - send `subject` / `htmlBody` drafts that haven't been saved yet
 *     (so the preview reflects the current edit, not the persisted
 *     override),
 *   - choose a locale (defaults to `en`),
 *   - override individual variable values (defaults to the registry
 *     `sample` field for any missing variable).
 *
 * Server-side render is the authoritative path — same code that runs
 * during real send. Browser-side rendering would diverge on escaping
 * rules and section handling.
 */

interface LocalizedString {
  [locale: string]: string
}

function isLocalizedString(v: unknown): v is LocalizedString {
  if (!v || typeof v !== "object") return false
  for (const val of Object.values(v)) {
    if (typeof val !== "string") return false
  }
  return true
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  const { key } = await params
  const def = getSystemMailEvent(key)
  if (!def) return jsonError("Unknown event key", 404)

  let body: {
    subject?: unknown
    htmlBody?: unknown
    locale?: unknown
    variables?: unknown
  } = {}
  try {
    body = await request.json()
  } catch {
    // empty body is allowed — fall back to all defaults
  }

  const locale =
    typeof body.locale === "string" && body.locale.trim()
      ? body.locale.trim()
      : "en"

  const draft: { subject?: LocalizedString; htmlBody?: LocalizedString } = {}
  if (isLocalizedString(body.subject)) draft.subject = body.subject
  if (isLocalizedString(body.htmlBody)) draft.htmlBody = body.htmlBody

  // Build variable values from registry samples, then layer caller
  // overrides on top. Missing-from-payload === use sample.
  const sampleVars: Record<string, string | number | boolean> = {}
  for (const v of def.variables) sampleVars[v.name] = v.sample

  if (body.variables && typeof body.variables === "object") {
    for (const [k, v] of Object.entries(body.variables)) {
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        sampleVars[k] = v
      }
    }
  }

  const rendered = await renderSystemMailEvent(
    def.key,
    locale,
    sampleVars,
    {
      // Bypass the global resolver — we want the preview to reflect
      // the draft (or registry default if no draft sent), not the
      // currently-persisted override (the admin has the override open
      // in the editor and probably edited it).
      override: null,
      draft: Object.keys(draft).length > 0 ? draft : undefined,
    },
  )

  if (!rendered) return jsonError("Render failed", 500)

  return jsonSuccess({
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    locale,
    sampleVariables: sampleVars,
  })
}
