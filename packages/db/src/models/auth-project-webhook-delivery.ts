import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"
import type { AuthWebhookEventTopic } from "./auth-project-webhook"

const COLLECTION = "auth_project_webhook_deliveries"

/**
 * Auth webhook delivery log — her dispatch'in sonucu (HTTP status, latency,
 * attempts, error). Dashboard delivery log + debug için. TTL 30 gün.
 *
 * `status_notify_deliveries` pattern'inin auth-specific muadili.
 */

export type DeliveryStatus = "delivered" | "failed"

export interface AuthProjectWebhookDelivery {
  id: string
  authProjectId: string
  webhookId: string
  /** Hangi event topic dispatch edildi (UI'da quick filter için). */
  eventTopic: AuthWebhookEventTopic
  /** İlişkili user (varsa, UI deep-link için). */
  userId: string | null
  /** Hedef URL — webhook'un URL'i değişebilir, dispatch sırasındaki değeri
   *  audit için tutuyoruz. */
  url: string
  status: DeliveryStatus
  httpStatus: number | null
  latencyMs: number
  attempts: number
  errorMessage: string | null
  /** Delivery payload özeti (full payload değil, ilk 2KB). Debug için. */
  payloadPreview: string
  /** Sentroy-side request id (RP receiver tarafında log için header'da gönderilir). */
  deliveryId: string
  createdAt: Date
}

const TTL_DAYS = 30

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

// ─── Queries ──────────────────────────────────────────────────────────────

export async function listByProject(
  authProjectId: string,
  opts: {
    limit?: number
    skip?: number
    webhookId?: string
    status?: DeliveryStatus
    eventTopic?: AuthWebhookEventTopic
  } = {},
): Promise<AuthProjectWebhookDelivery[]> {
  const c = await col()
  const filter: Record<string, unknown> = { authProjectId }
  if (opts.webhookId) filter.webhookId = opts.webhookId
  if (opts.status) filter.status = opts.status
  if (opts.eventTopic) filter.eventTopic = opts.eventTopic
  const docs = await c
    .find(filter)
    .sort({ createdAt: -1 })
    .skip(opts.skip ?? 0)
    .limit(opts.limit ?? 50)
    .toArray()
  return docs.map((d) => toId(d) as AuthProjectWebhookDelivery)
}

export async function countByProject(
  authProjectId: string,
  opts: {
    webhookId?: string
    status?: DeliveryStatus
    eventTopic?: AuthWebhookEventTopic
  } = {},
): Promise<number> {
  const c = await col()
  const filter: Record<string, unknown> = { authProjectId }
  if (opts.webhookId) filter.webhookId = opts.webhookId
  if (opts.status) filter.status = opts.status
  if (opts.eventTopic) filter.eventTopic = opts.eventTopic
  return c.countDocuments(filter)
}

// ─── Mutations ────────────────────────────────────────────────────────────

export async function record(
  input: Omit<AuthProjectWebhookDelivery, "id" | "createdAt">,
): Promise<void> {
  const c = await col()
  await c.insertOne({ ...input, createdAt: new Date() } as Record<string, unknown>)
}

export async function removeByProject(authProjectId: string): Promise<number> {
  const c = await col()
  const r = await c.deleteMany({ authProjectId })
  return r.deletedCount ?? 0
}

export async function removeByWebhook(webhookId: string): Promise<number> {
  const c = await col()
  const r = await c.deleteMany({ webhookId })
  return r.deletedCount ?? 0
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ authProjectId: 1, createdAt: -1 })
  await c.createIndex({ webhookId: 1, createdAt: -1 })
  await c.createIndex(
    { createdAt: 1 },
    { expireAfterSeconds: TTL_DAYS * 24 * 60 * 60 },
  )
}
