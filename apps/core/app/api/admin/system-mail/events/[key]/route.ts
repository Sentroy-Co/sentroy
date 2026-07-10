import { NextRequest } from "next/server"
import {
  jsonError,
  jsonSuccess,
  getAuthSession,
} from "@workspace/console/lib/api-helpers"
import { systemMailEventTemplateModel } from "@workspace/db/models"
import { getSystemMailEvent } from "@workspace/auth/server/system-mail-events"

/**
 * Per-event detail / mutate / reset.
 *
 *   GET    — full event payload (registry definition + current override)
 *   PUT    — write override (subject + htmlBody dictionaries; enabled flag)
 *   DELETE — drop override = revert to registry default
 *
 * The registry is the source of truth for "which events exist" and
 * "what variables they accept" — admins can only override copy, not
 * change the variable contract or invent new event keys.
 */

interface LocalizedString {
  [locale: string]: string
}

function isLocalizedString(v: unknown): v is LocalizedString {
  if (!v || typeof v !== "object") return false
  for (const [k, val] of Object.entries(v)) {
    if (typeof k !== "string") return false
    if (typeof val !== "string") return false
  }
  return true
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  const { key } = await params
  const def = getSystemMailEvent(key)
  if (!def) return jsonError("Unknown event key", 404)

  const override = await systemMailEventTemplateModel.findByKey(key)
  return jsonSuccess({
    key: def.key,
    category: def.category,
    label: def.label,
    description: def.description,
    variables: def.variables,
    defaultSubject: def.defaultSubject,
    defaultHtmlBody: def.defaultHtmlBody,
    override: override
      ? {
          subject: override.subject,
          htmlBody: override.htmlBody,
          enabled: override.enabled !== false,
          updatedAt: override.updatedAt,
          updatedBy: override.updatedBy,
        }
      : null,
    customized: Boolean(override),
  })
}

export async function PUT(
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
    enabled?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (!isLocalizedString(body.subject)) {
    return jsonError("subject must be a { locale: string } map")
  }
  if (!isLocalizedString(body.htmlBody)) {
    return jsonError("htmlBody must be a { locale: string } map")
  }

  // Trim whitespace + drop empty locales — empty string would cause
  // the renderer to fall through to the default anyway, but persisting
  // empties bloats the document and confuses listing.
  const subject: LocalizedString = {}
  for (const [loc, val] of Object.entries(body.subject)) {
    const trimmed = val.trim()
    if (trimmed) subject[loc] = trimmed
  }
  const htmlBody: LocalizedString = {}
  for (const [loc, val] of Object.entries(body.htmlBody)) {
    const trimmed = val.trim()
    if (trimmed) htmlBody[loc] = trimmed
  }

  // At least one locale must remain on each side; otherwise the override
  // is empty and we should reject (admin should DELETE to reset, not
  // save an empty document).
  if (Object.keys(subject).length === 0) {
    return jsonError("At least one locale must have a non-empty subject")
  }
  if (Object.keys(htmlBody).length === 0) {
    return jsonError("At least one locale must have a non-empty htmlBody")
  }

  const enabled =
    typeof body.enabled === "boolean" ? body.enabled : true

  const saved = await systemMailEventTemplateModel.upsertByKey(key, {
    subject,
    htmlBody,
    enabled,
    updatedBy: session.user.id,
  })

  return jsonSuccess({
    key: def.key,
    override: {
      subject: saved.subject,
      htmlBody: saved.htmlBody,
      enabled: saved.enabled !== false,
      updatedAt: saved.updatedAt,
      updatedBy: saved.updatedBy,
    },
    customized: true,
  })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  const { key } = await params
  const def = getSystemMailEvent(key)
  if (!def) return jsonError("Unknown event key", 404)

  const removed = await systemMailEventTemplateModel.deleteByKey(key)
  return jsonSuccess({
    key: def.key,
    reset: removed,
    customized: false,
  })
}
