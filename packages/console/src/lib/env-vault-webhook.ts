import { createHmac } from "crypto"
import { envWebhookModel } from "@workspace/db/models"
import { decryptValue } from "./env-vault-crypto"
import { assertPublicUrl } from "./ssrf"

/**
 * Env-vault outbound webhook fan-out.
 *
 * Variable mutate eden tüm endpoint'ler `notifyVariableChange()` çağırır;
 * bu helper fire-and-forget'tir — caller'ı blocklamaz, hata response'a
 * yansımaz.
 *
 * Receiver tarafında:
 *   - `X-Sentroy-Signature: sha256=<hex>` header'ında HMAC-SHA256 imza
 *     (raw body üzerinden, webhook secret ile)
 *   - `X-Sentroy-Event: vault.variable.changed`
 *   - `X-Sentroy-Webhook-Id: <id>`
 *
 * Body shape (signed):
 *   {
 *     event: "vault.variable.changed",
 *     project: string,
 *     environment: string,
 *     action: "create" | "update" | "delete",
 *     keys: string[],            // bulk push'ta birden fazla key olabilir
 *     timestamp: number          // unix ms
 *   }
 *
 * Hata politikası: ne network fail ne 5xx caller'ı etkilemez. Her delivery
 * stat'ı (lastFiredAt, lastStatus, lastError) DB'de tutulur — admin UI
 * hangi webhook'ta sorun var görsün.
 */

interface ChangePayload {
  action: "create" | "update" | "delete"
  /** Tek bir key için tek elemanlı array; bulk push'ta birden fazla. */
  keys: string[]
}

const TIMEOUT_MS = 5_000

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex")
}

async function deliverOne(
  webhook: { id: string; url: string; secretCipher: string },
  body: string,
): Promise<void> {
  let secret: string
  try {
    secret = decryptValue(webhook.secretCipher)
  } catch (err) {
    await envWebhookModel.recordDelivery(
      webhook.id,
      null,
      `decrypt failed: ${err instanceof Error ? err.message : String(err)}`,
    )
    return
  }
  const signature = sign(body, secret)

  let status: number | null = null
  let error: string | null = null
  try {
    // SSRF guard: vault webhook URL'i iç servislere/metadata'ya yönlenemez.
    await assertPublicUrl(webhook.url)
    const res = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentroy-Signature": `sha256=${signature}`,
        "X-Sentroy-Event": "vault.variable.changed",
        "X-Sentroy-Webhook-Id": webhook.id,
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    status = res.status
    if (!res.ok) {
      error = `HTTP ${res.status}`
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }
  await envWebhookModel
    .recordDelivery(webhook.id, status, error)
    .catch(() => {})
}

/**
 * Fire-and-forget — caller `await` etmek zorunda değil. Yine de await
 * edersen delivery'leri bekler (test için kullanışlı).
 */
export async function notifyVariableChange(
  projectId: string,
  environment: string,
  payload: ChangePayload,
): Promise<void> {
  let webhooks: Awaited<ReturnType<typeof envWebhookModel.findByProjectAndEnv>>
  try {
    webhooks = await envWebhookModel.findByProjectAndEnv(projectId, environment)
  } catch {
    return
  }
  if (webhooks.length === 0) return

  const body = JSON.stringify({
    event: "vault.variable.changed",
    project: projectId,
    environment,
    action: payload.action,
    keys: payload.keys,
    timestamp: Date.now(),
  })

  // Tüm webhook'lara paralel fire — birinin hatası diğerlerini engellemez.
  await Promise.all(webhooks.map((w) => deliverOne(w, body)))
}

/**
 * Caller endpoint'inde `await` eklemek istemediğinde kullanılır:
 *   void fireVariableChange(projectId, env, payload)
 *
 * Promise rejection'ı yutar — request handler'a sızmaz.
 */
export function fireVariableChange(
  projectId: string,
  environment: string,
  payload: ChangePayload,
): void {
  notifyVariableChange(projectId, environment, payload).catch(() => {})
}
