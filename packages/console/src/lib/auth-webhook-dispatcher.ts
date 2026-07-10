import { createHmac, randomBytes } from "node:crypto"
import {
  authProjectWebhookModel,
  authProjectWebhookDeliveryModel,
} from "@workspace/db/models"
import { assertPublicUrl } from "./ssrf"
import type { AuthWebhookEventTopic } from "@workspace/db/models/auth-project-webhook"

/**
 * Auth-as-a-Service webhook dispatcher.
 *
 * Auth event'i (signup/login/password-changed vb.) handler içinde
 * `dispatchAuthWebhook(projectId, topic, payload, ctx?)` ile çağrılır.
 * Fire-and-forget — handler response'unu blocklamamak için
 * `void` döner; bekleyen tüm webhook'lar arka planda dispatch edilir.
 *
 * Imza:
 *   - `X-Sentroy-Signature: sha256=<hex>` — HMAC(secret, raw body)
 *   - `X-Sentroy-Event: <topic>`
 *   - `X-Sentroy-Delivery-Id: <random>`
 *
 * Retry: 3 attempt (0/2/10s backoff). 4xx (429 hariç) deterministik fail
 * → retry yok. 5xx ve network error → retry.
 *
 * Delivery log: her attempt sonrası `auth_project_webhook_deliveries`
 * koleksiyonuna yazılır (30 gün TTL).
 */

interface DispatchContext {
  /** Audit / debug için event'le ilişkili user. */
  userId?: string | null
}

export function dispatchAuthWebhook(
  authProjectId: string,
  topic: AuthWebhookEventTopic,
  payload: Record<string, unknown>,
  ctx: DispatchContext = {},
): void {
  // Fire-and-forget — handler response'unu beklemiyor.
  void (async () => {
    try {
      const targets = await authProjectWebhookModel.listActiveForTopic(
        authProjectId,
        topic,
      )
      if (targets.length === 0) return
      const envelope = {
        event: topic,
        timestamp: new Date().toISOString(),
        data: payload,
      }
      const body = JSON.stringify(envelope)
      await Promise.allSettled(
        targets.map((webhook) =>
          deliverOne(authProjectId, webhook, topic, body, ctx),
        ),
      )
    } catch (err) {
      console.warn(
        "[auth-webhook] dispatch error",
        err instanceof Error ? err.message : err,
      )
    }
  })()
}

async function deliverOne(
  authProjectId: string,
  webhook: { id: string; url: string; secret: string },
  topic: AuthWebhookEventTopic,
  body: string,
  ctx: DispatchContext,
): Promise<void> {
  const signature = createHmac("sha256", webhook.secret).update(body).digest("hex")
  const deliveryId = `dlv_${randomBytes(8).toString("hex")}`

  // SSRF guard: auth webhook URL'i iç servislere/metadata'ya yönlenemez.
  try {
    await assertPublicUrl(webhook.url)
  } catch (err) {
    await record(
      authProjectId,
      webhook.id,
      topic,
      webhook.url,
      {
        status: "failed",
        httpStatus: null,
        attempts: 0,
        errorMessage: (err instanceof Error ? err.message : "blocked URL").slice(0, 500),
      },
      Date.now(),
      body,
      deliveryId,
      ctx.userId ?? null,
    )
    return
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "sentroy-auth-webhook/1.0",
    "X-Sentroy-Event": topic,
    "X-Sentroy-Signature": `sha256=${signature}`,
    "X-Sentroy-Delivery-Id": deliveryId,
  }

  const delays = [0, 2_000, 10_000]
  const startedAt = Date.now()
  let lastHttpStatus: number | null = null
  let lastError: string | null = null
  let attemptsTaken = 0

  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt] > 0) {
      await new Promise((r) => setTimeout(r, delays[attempt]))
    }
    attemptsTaken = attempt + 1
    try {
      const res = await fetch(webhook.url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(10_000),
      })
      lastHttpStatus = res.status
      if (res.ok) {
        await record(
          authProjectId,
          webhook.id,
          topic,
          webhook.url,
          {
            status: "delivered",
            httpStatus: res.status,
            attempts: attemptsTaken,
            errorMessage: null,
          },
          startedAt,
          body,
          deliveryId,
          ctx.userId ?? null,
        )
        return
      }
      if (res.status < 500 && res.status !== 429) {
        const txt = await res.text().catch(() => "")
        await record(
          authProjectId,
          webhook.id,
          topic,
          webhook.url,
          {
            status: "failed",
            httpStatus: res.status,
            attempts: attemptsTaken,
            errorMessage: `HTTP ${res.status}: ${txt.slice(0, 400)}`,
          },
          startedAt,
          body,
          deliveryId,
          ctx.userId ?? null,
        )
        return
      }
      lastError = `HTTP ${res.status} (retried)`
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
  }

  await record(
    authProjectId,
    webhook.id,
    topic,
    webhook.url,
    {
      status: "failed",
      httpStatus: lastHttpStatus,
      attempts: attemptsTaken,
      errorMessage: (lastError ?? "exhausted retries").slice(0, 500),
    },
    startedAt,
    body,
    deliveryId,
    ctx.userId ?? null,
  )
}

async function record(
  authProjectId: string,
  webhookId: string,
  topic: AuthWebhookEventTopic,
  url: string,
  result: {
    status: "delivered" | "failed"
    httpStatus: number | null
    attempts: number
    errorMessage: string | null
  },
  startedAt: number,
  body: string,
  deliveryId: string,
  userId: string | null,
): Promise<void> {
  try {
    await authProjectWebhookDeliveryModel.record({
      authProjectId,
      webhookId,
      eventTopic: topic,
      userId,
      url,
      status: result.status,
      httpStatus: result.httpStatus,
      latencyMs: Date.now() - startedAt,
      attempts: result.attempts,
      errorMessage: result.errorMessage,
      payloadPreview: body.slice(0, 2048),
      deliveryId,
    })
  } catch (err) {
    console.warn(
      "[auth-webhook] delivery record failed:",
      err instanceof Error ? err.message : err,
    )
  }
}
