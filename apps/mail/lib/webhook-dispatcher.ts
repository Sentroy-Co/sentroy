import "server-only"
import { webhookDeliveryModel } from "@workspace/db/models"
import type { WebhookDeliveryKind } from "@workspace/db/models/webhook-delivery"
import { assertPublicUrl } from "@workspace/console/lib/ssrf"

const DISPATCH_TIMEOUT_MS = 10_000

export interface DispatchInput {
  webhookId: string
  companyId: string
  url: string
  event: string
  payload: Record<string, unknown>
  kind: WebhookDeliveryKind
  triggeredBy: string
  /** Set when this dispatch is a replay of an existing delivery row. */
  replayOf?: string
}

export interface DispatchResult {
  deliveryId: string
  responseStatus: number
  durationMs: number
  status: "success" | "failed"
  error?: string
}

/**
 * Fire a single webhook event at the customer's URL and persist the
 * outcome as a `webhook_deliveries` row. The wire payload follows the
 * Sentroy convention: top-level `event`, ISO `timestamp`, `data` object.
 *
 *   POST <url>
 *   X-Sentroy-Event: <event>
 *   X-Sentroy-Webhook-Id: <webhookId>
 *   Content-Type: application/json
 *
 *   { "event": "...", "timestamp": "...", "data": { ... } }
 *
 * Network errors, non-2xx responses, and 10-second timeouts all land as
 * `failed` rows with a usable diagnostic on the inspector.
 */
export async function dispatchWebhook(
  input: DispatchInput,
): Promise<DispatchResult> {
  const wireBody = JSON.stringify({
    event: input.event,
    timestamp: new Date().toISOString(),
    data: input.payload,
  })

  const start = Date.now()
  let responseStatus = 0
  let responseBody = ""
  let errorMessage: string | undefined

  try {
    // SSRF guard: müşteri webhook URL'i iç servislere/metadata'ya yönlenemez.
    await assertPublicUrl(input.url)
    const res = await fetch(input.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentroy-Event": input.event,
        "X-Sentroy-Webhook-Id": input.webhookId,
        "User-Agent": "Sentroy-Webhook-Dispatcher/1.0",
      },
      body: wireBody,
      signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
    })
    responseStatus = res.status
    try {
      responseBody = (await res.text()).slice(0, 4096)
    } catch {
      responseBody = ""
    }
    if (!res.ok) errorMessage = `HTTP ${res.status}`
  } catch (err) {
    errorMessage =
      err instanceof Error ? err.message : "Request failed"
    if (err instanceof Error && err.name === "TimeoutError") {
      errorMessage = `Timed out after ${DISPATCH_TIMEOUT_MS}ms`
    }
  }

  const durationMs = Date.now() - start
  const status: "success" | "failed" =
    responseStatus >= 200 && responseStatus < 300 ? "success" : "failed"

  const row = await webhookDeliveryModel.create({
    webhookId: input.webhookId,
    companyId: input.companyId,
    kind: input.kind,
    event: input.event,
    payload: input.payload,
    url: input.url,
    responseStatus,
    responseBody,
    durationMs,
    status,
    ...(errorMessage ? { error: errorMessage } : {}),
    ...(input.replayOf ? { replayOf: input.replayOf } : {}),
    triggeredBy: input.triggeredBy,
  })

  return {
    deliveryId: row.id,
    responseStatus,
    durationMs,
    status,
    ...(errorMessage ? { error: errorMessage } : {}),
  }
}
