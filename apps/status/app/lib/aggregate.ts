import "server-only"
import { systemStatusProbeModel } from "@workspace/db/models"
import { getDb } from "@workspace/db/client"

export type ServiceStatus = "operational" | "degraded" | "down" | "no-data"

export interface ServiceSummary {
  key: string
  label: string
  description: string
  /** Most recent probe outcome — "no-data" if no probes have ever fired. */
  status: ServiceStatus
  /** 24 hour-buckets, oldest → newest. */
  history: Array<{
    hour: string
    status: ServiceStatus
    hadIncident: boolean
  }>
  /** Uptime % over the visible window — null if no probes recorded. */
  uptimePct: number | null
}

export interface StatusSnapshot {
  generatedAt: string
  windowHours: number
  overall: ServiceStatus
  services: ServiceSummary[]
}

/**
 * Public-facing service catalog.
 *
 * Internal probe keys (mongodb, sentroy-api, cdn, mail-app, storage-app)
 * map to brand-uniform public labels — the platform doesn't need to leak
 * "MongoDB" as a component name to every visitor; "Database" carries the
 * same meaning without exposing the choice.
 */
const SERVICES: Array<{ key: string; label: string; description: string }> = [
  { key: "sentroy-api", label: "Mail API", description: "Transactional + bulk send pipeline" },
  { key: "mail-app", label: "Mail Dashboard", description: "mail.sentroy.com — inbox, templates, send UI" },
  { key: "storage-app", label: "Storage Dashboard", description: "storage.sentroy.com — buckets and media UI" },
  { key: "cdn", label: "CDN", description: "Public file delivery and image transforms" },
  { key: "mongodb", label: "Database", description: "Primary data store backing the platform" },
]

const SEVERITY: Record<ServiceStatus, number> = {
  operational: 0,
  "no-data": 0,
  degraded: 1,
  down: 2,
}

async function getLatestStatus(key: string): Promise<ServiceStatus> {
  const db = await getDb()
  const c = db.collection("system_status_probes")
  const last = await c
    .find({ key })
    .sort({ timestamp: -1 })
    .limit(1)
    .toArray()
  const status = last[0]?.status as ServiceStatus | undefined
  return status ?? "no-data"
}

function computeUptime(
  history: Array<{ status: ServiceStatus; hadIncident: boolean }>,
): number | null {
  const observed = history.filter((b) => b.status !== "no-data")
  if (observed.length === 0) return null
  const clean = observed.filter(
    (b) => !b.hadIncident && b.status === "operational",
  ).length
  return Math.round((clean / observed.length) * 1000) / 10 // 1 decimal
}

function pickOverall(statuses: ServiceStatus[]): ServiceStatus {
  let worst: ServiceStatus = "operational"
  let observed = false
  for (const s of statuses) {
    if (s === "no-data") continue
    observed = true
    if (SEVERITY[s] > SEVERITY[worst]) worst = s
  }
  if (!observed) return "no-data"
  return worst
}

/**
 * Build a public status snapshot from the probe collection. The page
 * and the JSON endpoint both call this — single source of truth for the
 * shape exposed to the outside world.
 */
export async function buildStatusSnapshot(opts?: {
  hours?: number
}): Promise<StatusSnapshot> {
  const hours = opts?.hours ?? 24

  const [history, currents] = await Promise.all([
    systemStatusProbeModel.aggregateHistory({ hours }),
    Promise.all(SERVICES.map((s) => getLatestStatus(s.key))),
  ])

  const services: ServiceSummary[] = SERVICES.map((s, idx) => {
    const buckets = history[s.key] ?? []
    const safeHistory = buckets.map((b) => ({
      hour: b.hour,
      status: (b.status as ServiceStatus) ?? "no-data",
      hadIncident: b.hadIncident,
    }))
    return {
      key: s.key,
      label: s.label,
      description: s.description,
      status: currents[idx] ?? "no-data",
      history: safeHistory,
      uptimePct: computeUptime(safeHistory),
    }
  })

  return {
    generatedAt: new Date().toISOString(),
    windowHours: hours,
    overall: pickOverall(services.map((s) => s.status)),
    services,
  }
}
