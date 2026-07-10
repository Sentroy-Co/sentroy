import {
  statusCheckModel,
  statusProbeEventModel,
  statusUptimeRollupModel,
} from "@workspace/db/models"

/**
 * Daily uptime rollup job — worker her saatte bir tetikler.
 *
 * Algoritma:
 *   1. Tüm enabled check'leri al (findDue all-enabled döner).
 *   2. Her check için son ROLLUP_BACKFILL_DAYS gün için (bugün hariç):
 *      - O gün için raw probe events aggregate et
 *      - status_uptime_rollups koleksiyonuna upsert (idempotent)
 *   3. Bugünkü gün partial — worker gece çalışırsa yarın upsert eder.
 *
 * Idempotent: aynı gün için tekrar çağrı update aynı değerleri yazar.
 * Aggregate query 1 gün ve 1 check için cheap (Mongo $dateTrunc + count).
 *
 * Hatalar fatal değil — bir sonraki saat tekrar denenir.
 */

const ROLLUP_CHECK_INTERVAL_MS = 60 * 60 * 1000 // 1 saat
const ROLLUP_BACKFILL_DAYS = 7

let lastRollupAt = 0

export async function maybeRunUptimeRollup(now: number): Promise<{
  written: number
  skipped: boolean
}> {
  if (now - lastRollupAt < ROLLUP_CHECK_INTERVAL_MS) {
    return { written: 0, skipped: true }
  }
  lastRollupAt = now

  let written = 0
  try {
    const checks = await statusCheckModel.findDue(new Date())
    const todayUtc = new Date()
    todayUtc.setUTCHours(0, 0, 0, 0)
    const dayMs = 24 * 60 * 60 * 1000

    for (const check of checks) {
      for (let i = 1; i <= ROLLUP_BACKFILL_DAYS; i++) {
        const day = new Date(todayUtc.getTime() - i * dayMs)
        const nextDay = new Date(day.getTime() + dayMs)
        let aggregates: Awaited<
          ReturnType<typeof statusProbeEventModel.aggregateDaily>
        >
        try {
          aggregates = await statusProbeEventModel.aggregateDaily(
            check.id,
            day,
            new Date(nextDay.getTime() - 1),
          )
        } catch (err) {
          console.warn(
            `[rollup] aggregate failed for check=${check.id} day=${day.toISOString().slice(0, 10)}:`,
            err instanceof Error ? err.message : err,
          )
          continue
        }

        const agg = aggregates[0]
        if (!agg || agg.eventCount === 0) continue

        try {
          await statusUptimeRollupModel.upsertDay({
            checkId: check.id,
            componentId: check.componentId,
            pageId: check.pageId,
            day,
            totalProbes: agg.eventCount,
            operationalProbes: agg.operationalCount,
            degradedProbes: agg.degradedCount,
            downProbes: agg.downCount,
            worstStatus: agg.worstStatus,
            avgLatencyMs: null,
          })
          written++
        } catch (err) {
          console.warn(
            `[rollup] upsert failed for check=${check.id} day=${day.toISOString().slice(0, 10)}:`,
            err instanceof Error ? err.message : err,
          )
        }
      }
    }
  } catch (err) {
    console.warn(
      "[rollup] check list fetch failed:",
      err instanceof Error ? err.message : err,
    )
  }

  if (written > 0) {
    console.log(`[rollup] wrote ${written} daily rollup entries`)
  }
  return { written, skipped: false }
}
