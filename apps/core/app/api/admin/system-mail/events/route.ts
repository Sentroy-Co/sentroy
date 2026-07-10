import { NextRequest } from "next/server"
import {
  jsonError,
  jsonSuccess,
  getAuthSession,
} from "@workspace/console/lib/api-helpers"
import { systemMailEventTemplateModel } from "@workspace/db/models"
import { listSystemMailEvents } from "@workspace/auth/server/system-mail-events"

/**
 * Lists every event from the code-side registry, joined with whatever
 * override exists in `system_mail_event_templates`. UI uses this to
 * render the registry sidebar — each row already knows whether the
 * event is "Customized" or running on defaults, plus the categories
 * for grouping.
 *
 * Admin-only. Subject + body are returned as locale dictionaries; the
 * UI picks the right locale based on the editor's locale toggle.
 */
export async function GET(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  const events = listSystemMailEvents()
  const overrides = await systemMailEventTemplateModel.listAll()
  const overrideMap = new Map(overrides.map((o) => [o.eventKey, o]))

  const rows = events.map((event) => {
    const override = overrideMap.get(event.key) ?? null
    return {
      key: event.key,
      category: event.category,
      label: event.label,
      description: event.description,
      variables: event.variables,
      defaultSubject: event.defaultSubject,
      defaultHtmlBody: event.defaultHtmlBody,
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
    }
  })

  return jsonSuccess(rows)
}
