import { createServer } from "node:http"
import { statusCheckModel } from "@workspace/db/models"
import type { StatusCheck } from "@workspace/db/models/status-check"
import { probeCheck, recordProbeResult } from "./probe"
import { maybeTriggerRestart } from "./restart"
import { maybeOpenAutoIncident, maybeAutoResolveIncident } from "./incident"
import {
  checkIncidentUpdateNotifications,
  checkMaintenanceNotifications,
} from "./notify"
import { maybeRunUptimeRollup } from "./rollup"

/**
 * Sentroy Status Worker — bağımsız Node.js process.
 *
 * Tick loop:
 *   1. DB'den enabled check'leri çek
 *   2. Her check için: lastProbedAt + intervalSeconds <= now ise due
 *   3. Due check'leri parallel probe et (Promise.allSettled)
 *   4. Her probe sonucunda: DB'ye event yaz + health state güncelle
 *   5. Health state.consecutiveFailures threshold aştıysa: restart trigger
 *   6. 3+ ardışık down → auto incident open
 *   7. Operational + son 30dk operational ise → auto incident resolve
 *
 * lastProbedAt: in-memory cache (process lifetime). Worker restart sonrası
 * cache sıfırlanır, tüm check'ler hemen due — bir kez "thundering herd"
 * olur ama bir interval window içinde normalize olur.
 *
 * Healthcheck: HTTP /health endpoint (Coolify liveness probe için).
 */

const TICK_INTERVAL_MS = 30_000 // her 30 saniyede check listesi yenilenir
const PROBE_CONCURRENCY = 10 // aynı anda max kaç probe (DB + network sat)
const HEALTH_PORT = Number(process.env.PORT || "3005")

// In-memory cache: checkId → last probed timestamp
const lastProbedAt = new Map<string, number>()
const tickStats = {
  totalTicks: 0,
  lastTickAt: null as Date | null,
  lastTickDuration: 0,
  lastTickProbed: 0,
  lastTickFailed: 0,
  totalProbed: 0,
  totalFailed: 0,
  lastIncidentNotifyAt: null as Date | null,
  totalIncidentNotifyDispatched: 0,
  lastMaintenanceNotifyAt: null as Date | null,
  totalMaintenanceNotifyDispatched: 0,
  lastRollupAt: null as Date | null,
  totalRollupWritten: 0,
  bootAt: new Date(),
}

async function tick() {
  const startedAt = Date.now()
  tickStats.totalTicks++

  let allChecks: StatusCheck[]
  try {
    allChecks = await statusCheckModel.findDue(new Date())
  } catch (err) {
    console.error("[worker] check list fetch failed:", err)
    return
  }

  const now = Date.now()
  const due = allChecks.filter((c) => {
    const last = lastProbedAt.get(c.id)
    if (!last) return true // never probed
    return now - last >= c.intervalSeconds * 1000
  })

  if (due.length === 0) {
    tickStats.lastTickAt = new Date()
    tickStats.lastTickDuration = Date.now() - startedAt
    tickStats.lastTickProbed = 0
    return
  }

  // Concurrency-limited parallel probing
  let probed = 0
  let failed = 0
  const queue = [...due]
  async function worker() {
    while (queue.length > 0) {
      const check = queue.shift()
      if (!check) break
      try {
        await processCheck(check)
        probed++
      } catch (err) {
        failed++
        console.warn(
          `[worker] check ${check.id} (${check.name}) probe failed:`,
          err instanceof Error ? err.message : err,
        )
      }
      lastProbedAt.set(check.id, Date.now())
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(PROBE_CONCURRENCY, queue.length) }, () => worker()),
  )

  tickStats.lastTickAt = new Date()
  tickStats.lastTickDuration = Date.now() - startedAt
  tickStats.lastTickProbed = probed
  tickStats.lastTickFailed = failed
  tickStats.totalProbed += probed
  tickStats.totalFailed += failed

  // Notification scan (cheap — genelde 0-5 open incident)
  const [incidentNotify, maintenanceNotify, rollup] = await Promise.all([
    checkIncidentUpdateNotifications(),
    checkMaintenanceNotifications(Date.now()),
    maybeRunUptimeRollup(Date.now()),
  ])

  if (incidentNotify.dispatched > 0) {
    tickStats.lastIncidentNotifyAt = new Date()
    tickStats.totalIncidentNotifyDispatched += incidentNotify.dispatched
  }
  if (maintenanceNotify.dispatched > 0) {
    tickStats.lastMaintenanceNotifyAt = new Date()
    tickStats.totalMaintenanceNotifyDispatched += maintenanceNotify.dispatched
  }
  if (rollup.written > 0) {
    tickStats.lastRollupAt = new Date()
    tickStats.totalRollupWritten += rollup.written
  }

  if (probed > 0 || incidentNotify.dispatched > 0 || maintenanceNotify.dispatched > 0 || rollup.written > 0) {
    console.log(
      `[worker] tick #${tickStats.totalTicks}: probed=${probed} failed=${failed} notify[inc=${incidentNotify.dispatched} maint=${maintenanceNotify.dispatched}] rollup=${rollup.written} duration=${tickStats.lastTickDuration}ms`,
    )
  }
}

async function processCheck(check: StatusCheck) {
  const result = await probeCheck(check)
  const { consecutiveFailures } = await recordProbeResult(check, result)

  if (result.status === "down") {
    // Restart trigger (cooldown + threshold + target validation içeride)
    const restartOutcome = await maybeTriggerRestart(check, consecutiveFailures)
    if (restartOutcome.triggered) {
      console.log(
        `[worker] restart triggered for ${check.name}: ${restartOutcome.success ? "OK" : "FAIL"} — ${restartOutcome.message}`,
      )
    }

    // Auto-incident open
    await maybeOpenAutoIncident(check, consecutiveFailures).catch((err) => {
      console.warn(`[worker] auto incident open failed:`, err)
    })
  } else if (result.status === "operational") {
    // Auto-resolve: açık incident'i kontrol et
    await maybeAutoResolveIncident(check).catch((err) => {
      console.warn(`[worker] auto incident resolve check failed:`, err)
    })
  }
}

// ─── Healthcheck HTTP server ─────────────────────────────────────────────

const healthServer = createServer((req, res) => {
  if (req.url === "/health") {
    const now = Date.now()
    const uptimeMs = now - tickStats.bootAt.getTime()
    const lastTickAgoMs = tickStats.lastTickAt
      ? now - tickStats.lastTickAt.getTime()
      : null
    // ok=false eğer son tick 90s'dan eski (tick interval 30s, 3x grace)
    const stale = lastTickAgoMs !== null && lastTickAgoMs > 90_000
    res.writeHead(stale ? 503 : 200, { "Content-Type": "application/json" })
    res.end(
      JSON.stringify({
        ok: !stale,
        bootAt: tickStats.bootAt,
        uptimeMs,
        ticks: {
          total: tickStats.totalTicks,
          lastTickAt: tickStats.lastTickAt,
          lastTickAgoMs,
          lastTickDuration: tickStats.lastTickDuration,
          lastTickProbed: tickStats.lastTickProbed,
          lastTickFailed: tickStats.lastTickFailed,
        },
        probe: {
          totalProbed: tickStats.totalProbed,
          totalFailed: tickStats.totalFailed,
          cachedChecks: lastProbedAt.size,
        },
        notify: {
          incidentLastAt: tickStats.lastIncidentNotifyAt,
          incidentTotal: tickStats.totalIncidentNotifyDispatched,
          maintenanceLastAt: tickStats.lastMaintenanceNotifyAt,
          maintenanceTotal: tickStats.totalMaintenanceNotifyDispatched,
        },
        rollup: {
          lastAt: tickStats.lastRollupAt,
          totalWritten: tickStats.totalRollupWritten,
        },
      }),
    )
    return
  }
  res.writeHead(404)
  res.end()
})

// ─── Bootstrap ────────────────────────────────────────────────────────────

async function main() {
  console.log("[worker] Sentroy Status Worker starting…")
  console.log(`[worker] tick interval: ${TICK_INTERVAL_MS}ms`)
  console.log(`[worker] probe concurrency: ${PROBE_CONCURRENCY}`)
  console.log(`[worker] healthcheck: http://0.0.0.0:${HEALTH_PORT}/health`)

  healthServer.listen(HEALTH_PORT, "0.0.0.0", () => {
    console.log(`[worker] healthcheck server listening on ${HEALTH_PORT}`)
  })

  // İlk tick boot'tan hemen sonra
  tick().catch((err) => console.error("[worker] initial tick failed:", err))
  setInterval(() => {
    tick().catch((err) => console.error("[worker] tick failed:", err))
  }, TICK_INTERVAL_MS)

  // Graceful shutdown
  const shutdown = (signal: string) => {
    console.log(`[worker] received ${signal}, shutting down…`)
    healthServer.close(() => {
      process.exit(0)
    })
    setTimeout(() => process.exit(1), 10_000).unref()
  }
  process.on("SIGTERM", () => shutdown("SIGTERM"))
  process.on("SIGINT", () => shutdown("SIGINT"))
}

main().catch((err) => {
  console.error("[worker] fatal:", err)
  process.exit(1)
})
