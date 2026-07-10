import {
  statusIncidentModel,
  statusMaintenanceModel,
} from "@workspace/db/models"

/**
 * Worker → Status app internal notify dispatch.
 *
 * Worker DB'den un-notified incident updates + pending maintenance
 * transitions tespit eder, status app'inin internal endpoint'lerine
 * POST atar. Subscribers find + mail/webhook delivery + markNotified
 * orada yapılır (mail sender setup core'da, worker'da yok).
 *
 * Hatalar fatal değil — bir sonraki tick'te tekrar denenir.
 */

const STATUS_BASE = (
  process.env.STATUS_APP_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_STATUS_APP_URL ||
  "https://status.sentroy.com"
).replace(/\/+$/, "")

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || ""

let lastMaintenanceCheckAt = 0
const MAINTENANCE_CHECK_INTERVAL_MS = 5 * 60 * 1000 // her 5 dakikada

async function postInternal(path: string, body: unknown): Promise<boolean> {
  if (!INTERNAL_SECRET) {
    console.warn("[notify] INTERNAL_API_SECRET not set — skipping dispatch")
    return false
  }
  try {
    const res = await fetch(`${STATUS_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": INTERNAL_SECRET,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      console.warn(`[notify] ${path} → HTTP ${res.status} ${text.slice(0, 200)}`)
      return false
    }
    return true
  } catch (err) {
    console.warn(
      `[notify] ${path} dispatch failed:`,
      err instanceof Error ? err.message : err,
    )
    return false
  }
}

/**
 * Tüm açık + yakın resolved incident'leri tara, notifiedAt null update'ler
 * için status app'e internal POST at. Her tick'te çağrılır (cheap query —
 * genelde 0-5 open incident).
 */
export async function checkIncidentUpdateNotifications(): Promise<{
  scanned: number
  dispatched: number
}> {
  let scanned = 0
  let dispatched = 0

  try {
    const incidents = await statusIncidentModel.findRecentlyActiveAllPages()
    for (const incident of incidents) {
      for (const update of incident.updates) {
        scanned++
        if (update.notifiedAt) continue
        const ok = await postInternal(
          "/api/internal/status/notify-incident-update",
          { incidentId: incident.id, updateId: update.id },
        )
        if (ok) dispatched++
      }
    }
  } catch (err) {
    console.warn(
      "[notify] incident scan failed:",
      err instanceof Error ? err.message : err,
    )
  }

  return { scanned, dispatched }
}

/**
 * Maintenance reminder/started/completed kontrol — 5dk'da bir koşar.
 * Reminder: 1h pencerede başlayacak scheduled + notifiedReminder false.
 * Started: status in_progress + notifiedStarted false.
 * Completed: status completed + notifiedCompleted false.
 */
export async function checkMaintenanceNotifications(now: number): Promise<{
  dispatched: number
}> {
  if (now - lastMaintenanceCheckAt < MAINTENANCE_CHECK_INTERVAL_MS) {
    return { dispatched: 0 }
  }
  lastMaintenanceCheckAt = now

  let dispatched = 0
  try {
    const maintenances = await statusMaintenanceModel.findPendingNotifyAllPages()
    for (const m of maintenances) {
      let event: "reminder" | "started" | "completed" | null = null
      if (m.status === "completed" && !m.notifiedCompleted) event = "completed"
      else if (m.status === "in_progress" && !m.notifiedStarted) event = "started"
      else if (m.status === "scheduled" && !m.notifiedReminder) event = "reminder"
      if (!event) continue

      const ok = await postInternal("/api/internal/status/notify-maintenance", {
        maintenanceId: m.id,
        event,
      })
      if (ok) dispatched++
    }
  } catch (err) {
    console.warn(
      "[notify] maintenance scan failed:",
      err instanceof Error ? err.message : err,
    )
  }

  return { dispatched }
}
