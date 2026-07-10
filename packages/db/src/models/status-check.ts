import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "status_checks"

/**
 * Status Check — bir component'in altında, gerçek monitoring tanımı.
 * Phase 5 worker bu collection'ı tarayıp `intervalSeconds`'a göre due
 * olanları probe eder, sonucu `status_probe_events`'a yazar.
 *
 * Bir component'in birden çok check'i olabilir (örn. "API" component'in
 * altında "Health endpoint", "Login endpoint", "Sign-up endpoint" gibi
 * üç check). Component status'u bunların worst severity'sinden derive.
 *
 * v1: HTTP probe only. v2: TCP, ICMP, gRPC, custom script.
 */

export type StatusCheckMethod = "GET" | "POST" | "HEAD"
export type StatusCheckType = "http" | "tcp"

/**
 * TCP socket probe — host:port'a 3-way handshake denemesi.
 * Success: connect başarılı, latency degradedLatencyMs altında.
 * Degraded: connect başarılı ama latency degradedLatencyMs üstü.
 * Down: ECONNREFUSED / timeout / DNS fail.
 *
 * Use case: PostgreSQL / Redis / SMTP / SSH gibi non-HTTP servisler için.
 */
export interface StatusCheckTcpConfig {
  host: string
  port: number
  timeoutMs: number
  degradedLatencyMs: number
}

export interface StatusCheckHttpConfig {
  url: string
  method: StatusCheckMethod
  /** Opsiyonel custom header'lar (auth header'ı için).
   *  Hassas değer varsa env-vault şifrelemesinden geçer (Phase 7'de). */
  headers?: Record<string, string>
  /** Beklenen HTTP status range (örn. [200, 299]) — dışındaysa down. */
  expectedStatusMin: number
  expectedStatusMax: number
  /** Opsiyonel response body substring eşleşmesi. Boşsa skip. */
  expectedBodyContains: string | null
  /** Probe timeout (ms). Aşılırsa degraded ya da down (severity threshold'a göre). */
  timeoutMs: number
  /** Latency threshold — bu üstündeyse degraded (down değil). */
  degradedLatencyMs: number
  /** TLS sertifika doğrulamasını atla (self-signed dev için). v1 sadece bu flag. */
  insecureSkipTlsVerify: boolean
}

export interface StatusCheck {
  id: string
  componentId: string
  pageId: string
  /** İç ad (dashboard'da görünür). */
  name: string
  type: StatusCheckType
  /** HTTP check config — type="http" iken populate. */
  http: StatusCheckHttpConfig
  /** TCP socket check config — type="tcp" iken populate, aksi halde null. */
  tcp: StatusCheckTcpConfig | null
  /** Probe sıklığı saniye (min 30, max 3600). */
  intervalSeconds: number
  /** Worker bu check'i probe etmeli mi (paused → skip). */
  enabled: boolean
  /** Opsiyonel restart target reference (status_restart_targets.id).
   *  Sustained failure'da bu target tetiklenir (Phase 7). */
  restartTargetId: string | null
  /** Restart trigger threshold — kaç ardışık fail sonrası restart denenir.
   *  Min 2 (single failure transient olabilir). Default 3. */
  restartFailureThreshold: number
  /** Restart cooldown saniye — son restart'tan bu kadar geçmeden bir daha
   *  tetiklenmez (restart loop'u önle). Default 600. */
  restartCooldownSeconds: number
  createdAt: Date
  updatedAt: Date
}

const DEFAULT_HTTP: StatusCheckHttpConfig = {
  url: "",
  method: "GET",
  headers: {},
  expectedStatusMin: 200,
  expectedStatusMax: 299,
  expectedBodyContains: null,
  timeoutMs: 10000,
  degradedLatencyMs: 1000,
  insecureSkipTlsVerify: false,
}

const DEFAULT_TCP: StatusCheckTcpConfig = {
  host: "",
  port: 80,
  timeoutMs: 10000,
  degradedLatencyMs: 1000,
}

const MIN_INTERVAL_SECONDS = 30
const MAX_INTERVAL_SECONDS = 3600
const DEFAULT_INTERVAL_SECONDS = 60

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

// ─── Queries ──────────────────────────────────────────────────────────────

export async function findById(id: string): Promise<StatusCheck | null> {
  const c = await col()
  const doc = await c.findOne({ _id: toObjectId(id) })
  return doc ? toId(doc) : null
}

export async function findByComponent(
  componentId: string,
): Promise<StatusCheck[]> {
  const c = await col()
  const docs = await c.find({ componentId }).sort({ createdAt: 1 }).toArray()
  return docs.map((d) => toId(d))
}

export async function findByPage(
  pageId: string,
  opts: { onlyEnabled?: boolean } = {},
): Promise<StatusCheck[]> {
  const c = await col()
  const filter: Record<string, unknown> = { pageId }
  if (opts.onlyEnabled) filter.enabled = true
  const docs = await c.find(filter).toArray()
  return docs.map((d) => toId(d))
}

/**
 * Worker scheduler için — `enabled=true` ve son probe'tan
 * `intervalSeconds` geçmiş tüm check'leri döner. `dueBefore`
 * `lastProbedAt + intervalSeconds <= dueBefore` mantığı.
 *
 * v1: tek instance worker, batch tüm due check'leri parallel probe eder.
 * v2: leasing pattern (Phase 5 sonrası multi-region/multi-worker için).
 */
export async function findDue(dueBefore: Date): Promise<StatusCheck[]> {
  const c = await col()
  // `lastProbedAt` field'ı denormalize tutulmaz — probe history
  // status_probe_events'tan derive edilir. Worker her tick'te tüm
  // enabled check'leri çekip kendi side'ında lastProbedAt cache eder.
  // Bu function tüm enabled'ı döner; worker filter eder.
  const docs = await c.find({ enabled: true }).toArray()
  return docs.map((d) => toId(d))
}

export async function countByPage(pageId: string): Promise<number> {
  const c = await col()
  return c.countDocuments({ pageId })
}

export async function countByComponent(componentId: string): Promise<number> {
  const c = await col()
  return c.countDocuments({ componentId })
}

// ─── Mutations ────────────────────────────────────────────────────────────

export async function create(input: {
  componentId: string
  pageId: string
  name: string
  type?: StatusCheckType
  http?: Partial<StatusCheckHttpConfig> & { url?: string }
  tcp?: Partial<StatusCheckTcpConfig> & { host?: string; port?: number }
  intervalSeconds?: number
  restartTargetId?: string | null
  restartFailureThreshold?: number
  restartCooldownSeconds?: number
}): Promise<StatusCheck> {
  const c = await col()
  const now = new Date()
  const interval = clampInterval(input.intervalSeconds ?? DEFAULT_INTERVAL_SECONDS)
  const type = input.type ?? "http"

  const doc = {
    componentId: input.componentId,
    pageId: input.pageId,
    name: input.name.trim(),
    type,
    http: { ...DEFAULT_HTTP, ...(input.http ?? {}) },
    tcp: type === "tcp" ? { ...DEFAULT_TCP, ...(input.tcp ?? {}) } : null,
    intervalSeconds: interval,
    enabled: true,
    restartTargetId: input.restartTargetId ?? null,
    restartFailureThreshold: input.restartFailureThreshold ?? 3,
    restartCooldownSeconds: input.restartCooldownSeconds ?? 600,
    createdAt: now,
    updatedAt: now,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

export async function update(
  id: string,
  patch: Partial<
    Pick<
      StatusCheck,
      | "name"
      | "http"
      | "intervalSeconds"
      | "enabled"
      | "restartTargetId"
      | "restartFailureThreshold"
      | "restartCooldownSeconds"
    >
  >,
): Promise<StatusCheck | null> {
  const c = await col()
  const sanitized = { ...patch }
  if (typeof sanitized.intervalSeconds === "number") {
    sanitized.intervalSeconds = clampInterval(sanitized.intervalSeconds)
  }
  const result = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    { $set: { ...sanitized, updatedAt: new Date() } },
    { returnDocument: "after" },
  )
  return result ? toId(result) : null
}

export async function remove(id: string): Promise<boolean> {
  const c = await col()
  const result = await c.deleteOne({ _id: toObjectId(id) })
  return result.deletedCount === 1
}

export async function removeByComponent(componentId: string): Promise<number> {
  const c = await col()
  const r = await c.deleteMany({ componentId })
  return r.deletedCount ?? 0
}

export async function removeByPage(pageId: string): Promise<number> {
  const c = await col()
  const r = await c.deleteMany({ pageId })
  return r.deletedCount ?? 0
}

function clampInterval(s: number): number {
  return Math.min(MAX_INTERVAL_SECONDS, Math.max(MIN_INTERVAL_SECONDS, Math.floor(s)))
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ componentId: 1 })
  await c.createIndex({ pageId: 1 })
  await c.createIndex({ enabled: 1 })
  await c.createIndex({ restartTargetId: 1 })
}
