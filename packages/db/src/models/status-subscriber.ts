import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"
import { randomBytes, createHash } from "crypto"

const COLLECTION = "status_subscribers"

/**
 * Status Subscriber — public status page'in "Subscribe to updates"
 * widget'ı üzerinden kayıt olan email/webhook abone.
 *
 * Phase 8'de incident open/update/resolved + maintenance reminder
 * email/webhook gönderimleri buraya bakılarak yapılır.
 *
 * Email subscribers için **double opt-in** — yeni signup hemen subscribed
 * sayılmaz; verifyToken ile mail link onaylanmalı (RFC 8617 best practice).
 *
 * Webhook subscribers HMAC signed POST alır (`secret` her subscriber'a
 * özel, oluşturma sırasında bir kez gösterilir).
 */

export type SubscriberType = "email" | "webhook" | "telegram"

/** Hangi event'ler için bildirim almak istiyor (filter). */
export type SubscriberEventTopic =
  | "incident.opened"
  | "incident.updated"
  | "incident.resolved"
  | "maintenance.scheduled"
  | "maintenance.reminder"
  | "maintenance.started"
  | "maintenance.completed"

export interface StatusSubscriber {
  id: string
  pageId: string
  type: SubscriberType
  /** Email type: email adresi. Webhook type: HTTP URL.
   *  Telegram type: chat ID (numerik string, bot token ayrı alanda
   *  encrypted). */
  target: string
  /** Email subscriber double opt-in — token consume edilince true.
   *  Webhook + Telegram'da verify gerekmez (URL/chat sahibi zaten
   *  setup yapmış). */
  verified: boolean
  /** Yalnızca bu component'ler ile ilgili bildirim almak ister
   *  (boş array = tüm page bildirimleri). */
  componentFilter: string[]
  /** Hangi event tip'lerine abone (boş = hepsi). */
  topicFilter: SubscriberEventTopic[]
  /** Webhook secret SHA-256 hash (verify için body'i HMAC-SHA256 imzalar).
   *  Plaintext sadece create response'unda. */
  webhookSecretHash: string | null
  webhookSecretPrefix: string | null
  /** Telegram bot token AES-256-GCM encrypted. Worker decrypt edip
   *  api.telegram.org/bot<token>/sendMessage çağırır. */
  telegramBotTokenEncrypted: string | null
  /** Telegram bot token'ın ilk 10 karakter prefix'i (UI'da gösterim için). */
  telegramBotTokenPrefix: string | null
  /** Email verify / unsubscribe token'ı (URL-safe). Verify olunca silinmez,
   *  unsubscribe için aynı token re-use. */
  managementToken: string
  createdAt: Date
  verifiedAt: Date | null
  /** Soft delete — unsubscribe sonrası tutulur (audit + re-subscribe için). */
  unsubscribedAt: Date | null
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

function generateToken(): string {
  return randomBytes(24).toString("hex")
}

function generateWebhookSecret(): string {
  return `swhs_${randomBytes(24).toString("hex")}`
}

function hash(plain: string): string {
  return createHash("sha256").update(plain).digest("hex")
}

// ─── Queries ──────────────────────────────────────────────────────────────

export async function findById(id: string): Promise<StatusSubscriber | null> {
  const c = await col()
  const doc = await c.findOne({ _id: toObjectId(id) })
  return doc ? toId(doc) : null
}

export async function findByManagementToken(
  token: string,
): Promise<StatusSubscriber | null> {
  const c = await col()
  const doc = await c.findOne({ managementToken: token })
  return doc ? toId(doc) : null
}

export async function findActiveByPage(
  pageId: string,
  opts: { type?: SubscriberType; topic?: SubscriberEventTopic } = {},
): Promise<StatusSubscriber[]> {
  const c = await col()
  const filter: Record<string, unknown> = {
    pageId,
    verified: true,
    unsubscribedAt: null,
  }
  if (opts.type) filter.type = opts.type
  // topic filter: subscriber'ın topicFilter'ı boş VEYA topic içeriyorsa eşleş.
  if (opts.topic) {
    filter.$or = [
      { topicFilter: { $size: 0 } },
      { topicFilter: opts.topic },
    ]
  }
  const docs = await c.find(filter).toArray()
  return docs.map((d) => toId(d))
}

/**
 * Tüm subscribers (pending + active + unsubscribed) — dashboard list view'da
 * filtre seçenekleri için. Public delivery `findActiveByPage` kullanır.
 */
export async function findAllByPage(
  pageId: string,
): Promise<StatusSubscriber[]> {
  const c = await col()
  const docs = await c.find({ pageId }).sort({ createdAt: -1 }).toArray()
  return docs.map((d) => toId(d))
}

export async function countActiveByPage(pageId: string): Promise<number> {
  const c = await col()
  return c.countDocuments({
    pageId,
    verified: true,
    unsubscribedAt: null,
  })
}

export async function findByTarget(
  pageId: string,
  type: SubscriberType,
  target: string,
): Promise<StatusSubscriber | null> {
  const c = await col()
  const doc = await c.findOne({ pageId, type, target })
  return doc ? toId(doc) : null
}

// ─── Mutations ────────────────────────────────────────────────────────────

export async function create(input: {
  pageId: string
  type: SubscriberType
  target: string
  componentFilter?: string[]
  topicFilter?: SubscriberEventTopic[]
  /** Telegram için: bot token (plaintext). Caller encrypt edip
   *  `telegramBotTokenEncrypted` field'ına yazılır. */
  telegramBotTokenEncrypted?: string
  /** Admin/CSV bulk import için — email subscriber'ı verified olarak yarat
   *  (verify mail atılmaz). v1: dashboard manual import + GDPR opt-in zinciri
   *  RP tarafında. */
  preVerified?: boolean
}): Promise<{ subscriber: StatusSubscriber; webhookSecret: string | null }> {
  const c = await col()
  const now = new Date()
  let webhookSecret: string | null = null
  let webhookSecretHash: string | null = null
  let webhookSecretPrefix: string | null = null
  if (input.type === "webhook") {
    webhookSecret = generateWebhookSecret()
    webhookSecretHash = hash(webhookSecret)
    webhookSecretPrefix = webhookSecret.slice(0, 12)
  }

  let telegramBotTokenEncrypted: string | null = null
  let telegramBotTokenPrefix: string | null = null
  if (input.type === "telegram") {
    if (!input.telegramBotTokenEncrypted) {
      throw new Error("telegramBotTokenEncrypted required for telegram subscriber")
    }
    telegramBotTokenEncrypted = input.telegramBotTokenEncrypted
    // Encrypted blob format `v1:iv:tag:cipher`; prefix anlamlı değil,
    // sadece audit için ilk 16 char göster.
    telegramBotTokenPrefix = input.telegramBotTokenEncrypted.slice(0, 16)
  }

  // Email dışındaki tipler verify gerektirmez — URL/chat sahibi zaten
  // setup tarafında implicit consent vermiş. Admin bulk import için
  // preVerified=true ile email de bypass edebilir.
  const verifiedOnCreate = input.type !== "email" || input.preVerified === true

  const doc = {
    pageId: input.pageId,
    type: input.type,
    target: input.target.trim(),
    verified: verifiedOnCreate,
    componentFilter: input.componentFilter ?? [],
    topicFilter: input.topicFilter ?? [],
    webhookSecretHash,
    webhookSecretPrefix,
    telegramBotTokenEncrypted,
    telegramBotTokenPrefix,
    managementToken: generateToken(),
    createdAt: now,
    verifiedAt: verifiedOnCreate ? now : null,
    unsubscribedAt: null,
  }
  const result = await c.insertOne(doc)
  return {
    subscriber: { id: result.insertedId.toString(), ...doc },
    webhookSecret,
  }
}

export async function verify(token: string): Promise<StatusSubscriber | null> {
  const c = await col()
  const result = await c.findOneAndUpdate(
    { managementToken: token, verified: false },
    { $set: { verified: true, verifiedAt: new Date() } },
    { returnDocument: "after" },
  )
  return result ? toId(result) : null
}

export async function unsubscribe(
  token: string,
): Promise<StatusSubscriber | null> {
  const c = await col()
  const result = await c.findOneAndUpdate(
    { managementToken: token, unsubscribedAt: null },
    { $set: { unsubscribedAt: new Date() } },
    { returnDocument: "after" },
  )
  return result ? toId(result) : null
}

export async function updateFilters(
  id: string,
  patch: { componentFilter?: string[]; topicFilter?: SubscriberEventTopic[] },
): Promise<StatusSubscriber | null> {
  const c = await col()
  const result = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    { $set: patch },
    { returnDocument: "after" },
  )
  return result ? toId(result) : null
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

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ pageId: 1, type: 1, target: 1 }, { unique: true })
  await c.createIndex({ pageId: 1, verified: 1, unsubscribedAt: 1 })
  await c.createIndex({ managementToken: 1 }, { unique: true })
}
