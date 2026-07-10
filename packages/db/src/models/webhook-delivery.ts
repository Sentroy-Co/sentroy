import { ObjectId } from "mongodb"
import { getDb } from "../client"
import { toId } from "./_helpers"

const COLLECTION = "webhook_deliveries"

export type WebhookDeliveryStatus = "success" | "failed" | "pending"

export type WebhookDeliveryKind = "test" | "replay"

/**
 * Local audit log of every webhook dispatch initiated from the Sentroy
 * console — test-button payloads and replays of earlier deliveries. The
 * mail-server still drives production event delivery; this collection
 * captures everything the user explicitly fires from the dashboard so
 * they can inspect request/response without round-tripping the
 * mail-server's internal logs.
 */
export interface WebhookDelivery {
  id: string
  webhookId: string
  companyId: string
  /** "test" = ad-hoc payload from the test panel; "replay" = re-fire of
   *  an existing delivery row. */
  kind: WebhookDeliveryKind
  event: string
  payload: Record<string, unknown>
  /** URL the dispatcher actually POSTed to (frozen at dispatch time, in
   *  case the webhook URL is changed later). */
  url: string
  /** HTTP status returned by the receiver — 0 if the request never
   *  reached the server (DNS, timeout, network error). */
  responseStatus: number
  /** Truncated response body (max 4 KB) for the inspector. */
  responseBody: string
  /** Duration of the HTTP round-trip in ms. */
  durationMs: number
  /** "success" iff `responseStatus` is 2xx. */
  status: WebhookDeliveryStatus
  /** Network/HTTP error message — set when status === "failed". */
  error?: string
  /** When `kind === "replay"`, the source delivery id this row was
   *  fired from. Lets the inspector show "replay of #abc". */
  replayOf?: string
  /** Triggering user (or "system" for token/internal auth). */
  triggeredBy: string
  createdAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export interface CreateWebhookDeliveryInput {
  webhookId: string
  companyId: string
  kind: WebhookDeliveryKind
  event: string
  payload: Record<string, unknown>
  url: string
  responseStatus: number
  responseBody: string
  durationMs: number
  status: WebhookDeliveryStatus
  error?: string
  replayOf?: string
  triggeredBy: string
}

export async function create(
  input: CreateWebhookDeliveryInput,
): Promise<WebhookDelivery> {
  const c = await col()
  const doc = {
    webhookId: input.webhookId,
    companyId: input.companyId,
    kind: input.kind,
    event: input.event,
    payload: input.payload,
    url: input.url,
    responseStatus: input.responseStatus,
    responseBody: input.responseBody.slice(0, 4096),
    durationMs: input.durationMs,
    status: input.status,
    ...(input.error ? { error: input.error } : {}),
    ...(input.replayOf ? { replayOf: input.replayOf } : {}),
    triggeredBy: input.triggeredBy,
    createdAt: new Date(),
  }
  const r = await c.insertOne(doc)
  return toId({ _id: r.insertedId, ...doc })
}

export async function findByWebhook(
  webhookId: string,
  opts: {
    limit?: number
    skip?: number
    status?: WebhookDeliveryStatus
    /** IDOR guard — verilirse delivery'ler companyId'ye de scope'lanır;
     *  başka company'nin webhook delivery'leri webhookId tahminiyle okunamaz. */
    companyId?: string
  } = {},
): Promise<{ items: WebhookDelivery[]; total: number }> {
  const c = await col()
  const filter: Record<string, unknown> = { webhookId }
  if (opts.companyId) filter.companyId = opts.companyId
  if (opts.status) filter.status = opts.status
  const cursor = c
    .find(filter)
    .sort({ createdAt: -1 })
    .skip(opts.skip ?? 0)
    .limit(Math.min(opts.limit ?? 50, 100))
  const [docs, total] = await Promise.all([cursor.toArray(), c.countDocuments(filter)])
  return { items: docs.map(toId), total }
}

export async function findById(id: string): Promise<WebhookDelivery | null> {
  const c = await col()
  let oid: ObjectId
  try {
    oid = new ObjectId(id)
  } catch {
    return null
  }
  const doc = await c.findOne({ _id: oid })
  return doc ? toId(doc) : null
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ webhookId: 1, createdAt: -1 })
  await c.createIndex({ companyId: 1, createdAt: -1 })
  // 90-day TTL — deliveries are diagnostic, no need to keep them forever
  await c.createIndex({ createdAt: 1 }, { expireAfterSeconds: 90 * 86_400 })
}
