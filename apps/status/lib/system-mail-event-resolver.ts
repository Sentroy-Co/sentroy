import { systemMailEventTemplateModel } from "@workspace/db/models"
import type { SystemMailEventOverride } from "@workspace/auth/server/system-mail-events"

/**
 * DB-backed implementation of the resolver protocol declared in
 * `packages/auth/src/server/system-mail-events.ts`. Looks up the
 * override stored by the admin /system-mail/events editor and hands
 * it to the renderer; missing rows return null which lets the
 * registry default kick in.
 *
 * Bound at boot from `apps/core/instrumentation.ts`. Throw-free —
 * any DB hiccup is swallowed so the auth/invitation flow never
 * breaks because the override store is unreachable.
 */
export async function resolveSystemMailEventOverride(
  eventKey: string,
): Promise<SystemMailEventOverride | null> {
  try {
    const row = await systemMailEventTemplateModel.findByKey(eventKey)
    if (!row) return null
    return {
      subject: row.subject,
      htmlBody: row.htmlBody,
      enabled: row.enabled !== false,
    }
  } catch (err) {
    console.warn(
      `[system-mail-event-resolver] lookup failed for ${eventKey}:`,
      err,
    )
    return null
  }
}
