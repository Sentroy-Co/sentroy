import { getDb } from "../client"

const COLLECTION = "system_status_probes"

export type ServiceStatus = "operational" | "degraded" | "down"

/** Severity: aggregate sırasında $max ile worst-case status'u sayı üzerinden bulmak için. */
export const STATUS_SEVERITY: Record<ServiceStatus, number> = {
  operational: 0,
  degraded: 1,
  down: 2,
}

const SEVERITY_TO_STATUS: ServiceStatus[] = ["operational", "degraded", "down"]

export interface ProbeRecord {
  key: string
  status: ServiceStatus
  severity: number
  latencyMs: number
  error: string | null
  timestamp: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

const DEDUP_WINDOW_MS = 5 * 60 * 1000

/**
 * Probe sonucunu DB'ye yaz. 5dk dedup window'u — her admin sayfa açma
 * (30sn auto-refresh × N kullanıcı) yazma fırtınası yaratmasın. Status
 * değişmişse window içinde de yazılır (down → operational geçişini
 * kaçırmayalım).
 */
export async function recordProbe(input: {
  key: string
  status: ServiceStatus
  latencyMs: number
  error?: string | null
}): Promise<void> {
  const c = await col()
  const now = new Date()
  const since = new Date(now.getTime() - DEDUP_WINDOW_MS)

  const last = await c
    .find({ key: input.key, timestamp: { $gte: since } })
    .sort({ timestamp: -1 })
    .limit(1)
    .toArray()

  // Window içinde aynı status varsa skip — değişiklik varsa daima yaz.
  if (last[0] && last[0].status === input.status) return

  await c.insertOne({
    key: input.key,
    status: input.status,
    severity: STATUS_SEVERITY[input.status],
    latencyMs: input.latencyMs,
    error: input.error ?? null,
    timestamp: now,
  } satisfies ProbeRecord)
}

export interface HourBucket {
  /** ISO timestamp — bucket başlangıcı (HH:00:00) */
  hour: string
  /** Bu saatin **son** probe'unun status'u. Probe yoksa "no-data".
   *  "Saat içinde 1 down probe oldu, sonra düzeldi" senaryosunda son
   *  probe operational ise pill yeşil; geçmişte hata olduğu bilgisi
   *  ayrı `hadIncident` flag'i ile UI'ya iletilir. */
  status: ServiceStatus | "no-data"
  /** Bu saat içinde herhangi bir noktada degraded/down probe oldu mu.
   *  `status === "operational"` ama `hadIncident === true` ise: incident
   *  resolved (UI'da küçük amber dot tooltip ile gösterilebilir). */
  hadIncident: boolean
  /** Probe sayısı bu saatte */
  count: number
}

/**
 * Son `hours` saatlik veri için her servis × her saat bucket'ı döndür.
 * Atlassian-style pill grid için her servisin 24 (veya N) pill'lik dizisi.
 */
export async function aggregateHistory(opts: {
  hours: number
}): Promise<Record<string, HourBucket[]>> {
  const c = await col()
  const now = new Date()
  // Bucket'ları her saatin başına yuvarla (downward).
  const startBucket = new Date(now)
  startBucket.setMinutes(0, 0, 0)
  const since = new Date(startBucket.getTime() - (opts.hours - 1) * 3600_000)

  // Pill rengi için bucket'ın **son** probe'unun severity'si lazım.
  // Worst-severity ayrı tutuluyor (`hadIncident` indicator için: incident
  // resolved bilgisi UI'da gösterilebilir). $sort + $first ile son probe.
  const docs = await c
    .aggregate([
      { $match: { timestamp: { $gte: since } } },
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: {
            key: "$key",
            // Saat başına yuvarla — ms cinsinden epoch
            bucket: {
              $toLong: {
                $dateTrunc: { date: "$timestamp", unit: "hour" },
              },
            },
          },
          // Bucket içinde en son yazılan probe ($first çünkü desc sırada)
          lastSeverity: { $first: "$severity" },
          // Hadi indicator için worst da tut
          worstSeverity: { $max: "$severity" },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray()

  const services = new Map<
    string,
    Map<
      number,
      { lastSeverity: number; worstSeverity: number; count: number }
    >
  >()
  for (const d of docs) {
    const id = d._id as { key: string; bucket: number }
    const entry = d as unknown as {
      lastSeverity: number
      worstSeverity: number
      count: number
    }
    let svc = services.get(id.key)
    if (!svc) {
      svc = new Map()
      services.set(id.key, svc)
    }
    svc.set(id.bucket, {
      lastSeverity: entry.lastSeverity,
      worstSeverity: entry.worstSeverity,
      count: entry.count,
    })
  }

  const result: Record<string, HourBucket[]> = {}
  for (const [key, buckets] of services) {
    const arr: HourBucket[] = []
    for (let i = 0; i < opts.hours; i++) {
      const ts = new Date(since.getTime() + i * 3600_000)
      const epoch = ts.getTime()
      const b = buckets.get(epoch)
      const lastStatus = b
        ? (SEVERITY_TO_STATUS[b.lastSeverity] ?? "operational")
        : "no-data"
      arr.push({
        hour: ts.toISOString(),
        status: lastStatus,
        hadIncident: b ? b.worstSeverity > 0 : false,
        count: b?.count ?? 0,
      })
    }
    result[key] = arr
  }

  return result
}

export interface MinuteBucket {
  /** ISO timestamp — bucket başlangıcı (HH:MM:00) */
  minute: string
  /** Bu dakikadaki **son** probe'un status'u. Probe yoksa "no-data". */
  status: ServiceStatus | "no-data"
  /** Dakika içinde herhangi bir noktada incident var mıydı (resolved
   *  rozeti için). */
  hadIncident: boolean
  count: number
  /** Bu dakikadaki probe'ların ortalama latency'si (ms), yoksa null. */
  avgLatencyMs: number | null
}

/**
 * Verilen saatin (UTC, HH:00:00 başlangıçlı) 60 dakikalık bucket'ları —
 * tek bir servis için drill-down. Probe dedup'ı 5dk olduğu için
 * dakika başına typically 0-1 entry düşer; gap'ler "no-data".
 */
export async function aggregateMinutesForHour(opts: {
  serviceKey: string
  hourStart: Date
}): Promise<MinuteBucket[]> {
  const c = await col()
  const start = new Date(opts.hourStart)
  start.setMinutes(0, 0, 0)
  const end = new Date(start.getTime() + 3600_000)

  // Hour aggregation ile aynı pattern — last probe's severity pill rengini
  // belirler, worst severity hadIncident indicator için.
  const docs = await c
    .aggregate([
      {
        $match: {
          key: opts.serviceKey,
          timestamp: { $gte: start, $lt: end },
        },
      },
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: {
            bucket: {
              $toLong: {
                $dateTrunc: { date: "$timestamp", unit: "minute" },
              },
            },
          },
          lastSeverity: { $first: "$severity" },
          worstSeverity: { $max: "$severity" },
          avgLatency: { $avg: "$latencyMs" },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray()

  const byBucket = new Map<
    number,
    {
      lastSeverity: number
      worstSeverity: number
      count: number
      avgLatency: number
    }
  >()
  for (const d of docs) {
    const id = d._id as { bucket: number }
    const entry = d as unknown as {
      lastSeverity: number
      worstSeverity: number
      count: number
      avgLatency: number
    }
    byBucket.set(id.bucket, {
      lastSeverity: entry.lastSeverity,
      worstSeverity: entry.worstSeverity,
      count: entry.count,
      avgLatency: entry.avgLatency ?? 0,
    })
  }

  const arr: MinuteBucket[] = []
  for (let i = 0; i < 60; i++) {
    const ts = new Date(start.getTime() + i * 60_000)
    const epoch = ts.getTime()
    const b = byBucket.get(epoch)
    arr.push({
      minute: ts.toISOString(),
      status: b
        ? (SEVERITY_TO_STATUS[b.lastSeverity] ?? "operational")
        : "no-data",
      hadIncident: b ? b.worstSeverity > 0 : false,
      count: b?.count ?? 0,
      avgLatencyMs: b ? Math.round(b.avgLatency) : null,
    })
  }
  return arr
}

/** Eski probe kayıtlarını temizle — TTL alternatifi (Mongo TTL index de
 *  kurulabilir; manuel control için fonksiyon). */
export async function pruneOlderThan(days: number): Promise<number> {
  const c = await col()
  const cutoff = new Date(Date.now() - days * 86_400_000)
  const r = await c.deleteMany({ timestamp: { $lt: cutoff } })
  return r.deletedCount ?? 0
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ key: 1, timestamp: -1 })
  // 30 gün sonra otomatik silinsin — TTL index.
  await c.createIndex({ timestamp: 1 }, { expireAfterSeconds: 30 * 86_400 })
}
