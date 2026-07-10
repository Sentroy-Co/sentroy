import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "status_notify_deliveries"

/**
 * Status Notify Delivery — bir notify dispatch'inin per-subscriber
 * sonucu. Atlassian Statuspage'in "Webhook deliveries" benzeri: dashboard
 * "Delivery log" tab'ında subscriber sahibi her gönderimi görebilir.
 *
 * Write call site'ı: `status-notify-trigger.ts` deliverWebhook /
 * deliverTelegram / email branch'lerinden sonra.
 *
 * TTL: 30 gün. Debug için yeterli, storage'ı şişirmez.
 */

export type DeliveryChannel = "email" | "webhook" | "telegram"
export type DeliveryStatus = "delivered" | "failed" | "skipped"

export interface StatusNotifyDelivery {
  id: string
  pageId: string
  subscriberId: string
  /** Hangi subscriber'a — list view'de denormalize için. */
  subscriberType: DeliveryChannel
  subscriberTarget: string
  channel: DeliveryChannel
  /** "incident.opened", "incident.updated", "incident.resolved",
   *  "maintenance.reminder", "maintenance.started", "maintenance.completed".  */
  eventTopic: string
  /** İncident veya maintenance referansı (UI'da deep-link). */
  reference: {
    type: "incident" | "maintenance"
    id: string
    /** Incident update id (varsa). */
    updateId?: string
  }
  status: DeliveryStatus
  /** Webhook HTTP yanıt kodu (varsa). Telegram için Telegram API yanıt
   *  http status. Email için sender result.sent ise null, fail ise null. */
  httpStatus: number | null
  latencyMs: number
  attempts: number
  errorMessage: string | null
  createdAt: Date
}

const TTL_DAYS = 30

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

// ─── Queries ──────────────────────────────────────────────────────────────

export async function findByPage(
  pageId: string,
  opts: {
    limit?: number
    skip?: number
    channel?: DeliveryChannel
    status?: DeliveryStatus
    subscriberId?: string
  } = {},
): Promise<StatusNotifyDelivery[]> {
  const c = await col()
  const filter: Record<string, unknown> = { pageId }
  if (opts.channel) filter.channel = opts.channel
  if (opts.status) filter.status = opts.status
  if (opts.subscriberId) filter.subscriberId = opts.subscriberId
  const docs = await c
    .find(filter)
    .sort({ createdAt: -1 })
    .skip(opts.skip ?? 0)
    .limit(opts.limit ?? 50)
    .toArray()
  return docs.map((d) => toId(d) as unknown as StatusNotifyDelivery)
}

export async function countByPage(
  pageId: string,
  opts: {
    channel?: DeliveryChannel
    status?: DeliveryStatus
    subscriberId?: string
  } = {},
): Promise<number> {
  const c = await col()
  const filter: Record<string, unknown> = { pageId }
  if (opts.channel) filter.channel = opts.channel
  if (opts.status) filter.status = opts.status
  if (opts.subscriberId) filter.subscriberId = opts.subscriberId
  return c.countDocuments(filter)
}

// ─── Mutations ────────────────────────────────────────────────────────────

export async function record(
  input: Omit<StatusNotifyDelivery, "id" | "createdAt">,
): Promise<void> {
  const c = await col()
  await c.insertOne({
    ...input,
    createdAt: new Date(),
  } as Record<string, unknown>)
}

export async function removeByPage(pageId: string): Promise<number> {
  const c = await col()
  const r = await c.deleteMany({ pageId })
  return r.deletedCount ?? 0
}

export async function removeBySubscriber(subscriberId: string): Promise<number> {
  const c = await col()
  const r = await c.deleteMany({ subscriberId })
  return r.deletedCount ?? 0
}

export async function findById(id: string): Promise<StatusNotifyDelivery | null> {
  const c = await col()
  const doc = await c.findOne({ _id: toObjectId(id) })
  return doc ? (toId(doc) as unknown as StatusNotifyDelivery) : null
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ pageId: 1, createdAt: -1 })
  await c.createIndex({ subscriberId: 1, createdAt: -1 })
  await c.createIndex(
    { createdAt: 1 },
    { expireAfterSeconds: TTL_DAYS * 24 * 60 * 60 },
  )
}
