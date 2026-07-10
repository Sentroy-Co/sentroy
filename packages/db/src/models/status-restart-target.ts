import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "status_restart_targets"

/**
 * Status Restart Target — bir status check'in sustained failure'ında
 * tetiklenebilecek restart endpoint config'i. Multi-protocol:
 *
 *   - **http**: HTTP POST/GET (en yaygın — webhook, Coolify generic API,
 *     custom endpoint).
 *   - **ssh**: SSH komut çalıştırma (`docker restart x`, `systemctl restart`).
 *   - **coolify**: Coolify API doğrudan (resource-aware, type auto-detect).
 *
 * Hassas credentials (Bearer token, SSH private key) **env-vault crypto**
 * (AES-256-GCM) ile şifreli saklanır. Worker probe sırasında decrypt eder,
 * tetikler. UI'da hiç gösterilmez (sadece prefix/hint).
 *
 * Bir target birden çok check tarafından paylaşılabilir (örn. tek bir
 * Coolify resource UUID birden çok health check için target). Check
 * doğrudan target.id referans verir (`status_check.restartTargetId`).
 *
 * Audit: her restart trigger sonrası `audit_log`'a yazılır
 * (Phase 7 implementasyon'da).
 */

export type RestartTargetType = "http" | "ssh" | "coolify"

export interface HttpRestartConfig {
  url: string
  method: "POST" | "GET"
  /** Opsiyonel header'lar — şifresiz (örn. Content-Type). */
  headers: Record<string, string>
  /** Auth header'ı — şifreli (env-vault crypto blob). UI'da decrypt'siz
   *  gösterilmez; sadece var/yok bilgisi. */
  authHeaderEncrypted: string | null
  /** Auth header'ın hangi key'le set edileceği (örn. "Authorization",
   *  "X-Api-Key"). Decrypt sonrası bu key altında set edilir. */
  authHeaderName: string | null
  /** Opsiyonel POST body — JSON literal. Şifreli değil (genelde sabit
   *  payload, hassas değil). */
  bodyTemplate: string | null
  /** Beklenen success status range (genelde 200-299). */
  expectedStatusMin: number
  expectedStatusMax: number
  timeoutMs: number
}

export interface SshRestartConfig {
  host: string
  port: number
  username: string
  /** SSH private key PEM — şifreli. Decrypt edilip ssh2 client'ına geçirilir. */
  privateKeyEncrypted: string
  /** Opsiyonel passphrase — şifreli. Private key'in passphrase'i varsa. */
  passphraseEncrypted: string | null
  /** Çalıştırılacak komut (örn. "docker restart api-server").
   *  Single command, shell pipeline restricted. */
  command: string
  timeoutMs: number
}

export interface CoolifyRestartConfig {
  /** Coolify panel base URL (örn. https://coolify.example.com). */
  baseUrl: string
  /** API token — şifreli. */
  apiTokenEncrypted: string
  /** Hedef resource UUID. */
  resourceUuid: string
  /** "applications" | "services" | "auto" (auto = ilkini dene, başarısız
   *  ise diğerini dene — Sentroy internal pattern'i). */
  resourceType: "applications" | "services" | "auto"
  timeoutMs: number
}

export interface StatusRestartTarget {
  id: string
  pageId: string
  /** İç ad (dashboard'da gözükür, audit log'unda referans). */
  name: string
  type: RestartTargetType
  http: HttpRestartConfig | null
  ssh: SshRestartConfig | null
  coolify: CoolifyRestartConfig | null
  /** Target enabled mı (false = check'lerden referans alsa da tetiklenmez). */
  enabled: boolean
  /** Bu target tarafından bugüne kadar tetiklenmiş restart sayısı (audit). */
  totalTriggered: number
  /** Son trigger ne zaman. */
  lastTriggeredAt: Date | null
  /** Son trigger'ın sonucu (success / failure log). UI'da kısa görünür. */
  lastResult: { success: boolean; message: string; at: Date } | null
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

const DEFAULT_HTTP: Omit<HttpRestartConfig, "url"> = {
  method: "POST",
  headers: {},
  authHeaderEncrypted: null,
  authHeaderName: null,
  bodyTemplate: null,
  expectedStatusMin: 200,
  expectedStatusMax: 299,
  timeoutMs: 30000,
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

// ─── Queries ──────────────────────────────────────────────────────────────

export async function findById(
  id: string,
): Promise<StatusRestartTarget | null> {
  const c = await col()
  const doc = await c.findOne({ _id: toObjectId(id) })
  return doc ? toId(doc) : null
}

export async function findByPage(
  pageId: string,
): Promise<StatusRestartTarget[]> {
  const c = await col()
  const docs = await c.find({ pageId }).sort({ createdAt: 1 }).toArray()
  return docs.map((d) => toId(d))
}

// ─── Mutations ────────────────────────────────────────────────────────────

export async function createHttp(input: {
  pageId: string
  name: string
  config: Partial<HttpRestartConfig> & { url: string }
  createdBy: string
}): Promise<StatusRestartTarget> {
  const c = await col()
  const now = new Date()
  const doc = {
    pageId: input.pageId,
    name: input.name.trim(),
    type: "http" as const,
    http: { ...DEFAULT_HTTP, ...input.config },
    ssh: null,
    coolify: null,
    enabled: true,
    totalTriggered: 0,
    lastTriggeredAt: null,
    lastResult: null,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

export async function createSsh(input: {
  pageId: string
  name: string
  config: SshRestartConfig
  createdBy: string
}): Promise<StatusRestartTarget> {
  const c = await col()
  const now = new Date()
  const doc = {
    pageId: input.pageId,
    name: input.name.trim(),
    type: "ssh" as const,
    http: null,
    ssh: input.config,
    coolify: null,
    enabled: true,
    totalTriggered: 0,
    lastTriggeredAt: null,
    lastResult: null,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

export async function createCoolify(input: {
  pageId: string
  name: string
  config: CoolifyRestartConfig
  createdBy: string
}): Promise<StatusRestartTarget> {
  const c = await col()
  const now = new Date()
  const doc = {
    pageId: input.pageId,
    name: input.name.trim(),
    type: "coolify" as const,
    http: null,
    ssh: null,
    coolify: input.config,
    enabled: true,
    totalTriggered: 0,
    lastTriggeredAt: null,
    lastResult: null,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

export async function updateMeta(
  id: string,
  patch: { name?: string; enabled?: boolean },
): Promise<StatusRestartTarget | null> {
  const c = await col()
  const result = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    { $set: { ...patch, updatedAt: new Date() } },
    { returnDocument: "after" },
  )
  return result ? toId(result) : null
}

export async function updateHttpConfig(
  id: string,
  config: Partial<HttpRestartConfig>,
): Promise<StatusRestartTarget | null> {
  const c = await col()
  const result = await c.findOneAndUpdate(
    { _id: toObjectId(id), type: "http" },
    { $set: { http: config, updatedAt: new Date() } },
    { returnDocument: "after" },
  )
  return result ? toId(result) : null
}

export async function updateSshConfig(
  id: string,
  config: Partial<SshRestartConfig>,
): Promise<StatusRestartTarget | null> {
  const c = await col()
  const result = await c.findOneAndUpdate(
    { _id: toObjectId(id), type: "ssh" },
    { $set: { ssh: config, updatedAt: new Date() } },
    { returnDocument: "after" },
  )
  return result ? toId(result) : null
}

export async function updateCoolifyConfig(
  id: string,
  config: Partial<CoolifyRestartConfig>,
): Promise<StatusRestartTarget | null> {
  const c = await col()
  const result = await c.findOneAndUpdate(
    { _id: toObjectId(id), type: "coolify" },
    { $set: { coolify: config, updatedAt: new Date() } },
    { returnDocument: "after" },
  )
  return result ? toId(result) : null
}

/**
 * Worker tarafından restart trigger sonrası — counter + last result.
 */
export async function recordTrigger(
  id: string,
  result: { success: boolean; message: string },
): Promise<void> {
  const c = await col()
  const now = new Date()
  await c.updateOne(
    { _id: toObjectId(id) },
    {
      $inc: { totalTriggered: 1 },
      $set: {
        lastTriggeredAt: now,
        lastResult: { ...result, at: now },
        updatedAt: now,
      },
    },
  )
}

export async function remove(id: string): Promise<boolean> {
  const c = await col()
  const result = await c.deleteOne({ _id: toObjectId(id) })
  return result.deletedCount === 1
}

export async function removeByPage(pageId: string): Promise<number> {
  const c = await col()
  const r = await c.deleteMany({ pageId })
  return r.deletedCount ?? 0
}

/**
 * Target API'den dönerken hassas alanları drop et — UI'da yalnızca
 * prefix/hint görünsün; gerçek credential decrypt edilmez.
 */
export interface StatusRestartTargetPublic {
  id: string
  pageId: string
  name: string
  type: RestartTargetType
  enabled: boolean
  totalTriggered: number
  lastTriggeredAt: Date | null
  lastResult: { success: boolean; message: string; at: Date } | null
  createdAt: Date
  updatedAt: Date
  /** Type-specific public hint (URL, host, baseUrl). Credential'lar yok. */
  hint: {
    url?: string
    host?: string
    baseUrl?: string
    resourceUuid?: string
    hasAuth: boolean
  }
}

export function toPublic(target: StatusRestartTarget): StatusRestartTargetPublic {
  const hint: StatusRestartTargetPublic["hint"] = { hasAuth: false }
  if (target.type === "http" && target.http) {
    hint.url = target.http.url
    hint.hasAuth = !!target.http.authHeaderEncrypted
  } else if (target.type === "ssh" && target.ssh) {
    hint.host = `${target.ssh.username}@${target.ssh.host}:${target.ssh.port}`
    hint.hasAuth = true
  } else if (target.type === "coolify" && target.coolify) {
    hint.baseUrl = target.coolify.baseUrl
    hint.resourceUuid = target.coolify.resourceUuid
    hint.hasAuth = true
  }
  return {
    id: target.id,
    pageId: target.pageId,
    name: target.name,
    type: target.type,
    enabled: target.enabled,
    totalTriggered: target.totalTriggered,
    lastTriggeredAt: target.lastTriggeredAt,
    lastResult: target.lastResult,
    createdAt: target.createdAt,
    updatedAt: target.updatedAt,
    hint,
  }
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ pageId: 1 })
  await c.createIndex({ pageId: 1, type: 1 })
}
