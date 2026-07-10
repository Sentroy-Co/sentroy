/**
 * Linear webhook yönetimi (triage webhooks.server.ts portu, multi-tenant).
 *
 * `ctx.apiKey` ile `webhookCreate` çağırır; signing secret'ı BİZ üretip hem
 * Linear'a verir hem şirketin `linear_settings` dokümanına CIPHER olarak
 * yazarız (`encryptValue`, master key `SENTROY_ENV_MASTER_KEY`) — böylece
 * webhook alıcısındaki HMAC doğrulaması tutar. Plaintext secret response'a/
 * log'a ASLA yazılmaz.
 *
 * İdempotans: bizim şirket-endpoint'imize kayıtlı eski webhook'ları önce
 * siler, sonra temiz bir secret'la yeniden oluşturur (secret'ı kesin senkron
 * tutar; duplicate event önler).
 */
import { randomBytes } from "crypto"
import { linearSettingsModel } from "@workspace/db/models"
import {
  encryptValue,
  isVaultConfigured,
} from "@workspace/console/lib/env-vault-crypto"
import { linearGraphQL } from "./client"
import {
  WEBHOOKS_QUERY,
  WEBHOOK_CREATE_MUTATION,
  WEBHOOK_DELETE_MUTATION,
} from "./queries"
import { LinearError } from "../errors"
import type { LinearContext } from "./context"

const RESOURCE_TYPES = ["Issue", "Comment"]

type WebhookNode = {
  id: string
  url: string
  enabled: boolean
  resourceTypes: string[]
}

/**
 * Linear'a kaydedilecek şirkete özgü webhook endpoint'i. Public base
 * `publicUrl` (verilirse) ya da `NEXT_PUBLIC_LINEAR_APP_URL` env'inden gelir.
 * Alıcı: apps/linear `app/api/linear-webhook/[companyId]/route.ts` (PUBLIC,
 * imza HMAC-SHA256 ile doğrulanır).
 */
export function linearWebhookEndpoint(
  companyId: string,
  publicUrl?: string | null,
): string {
  const base = (
    publicUrl?.trim() ||
    process.env.NEXT_PUBLIC_LINEAR_APP_URL ||
    "https://linear.sentroy.com"
  ).replace(/\/+$/, "")
  return `${base}/api/linear-webhook/${companyId}`
}

export async function listLinearWebhooks(
  ctx: LinearContext,
): Promise<WebhookNode[]> {
  const data = await linearGraphQL<{ webhooks: { nodes: WebhookNode[] } }>(
    ctx,
    WEBHOOKS_QUERY,
  )
  return data.webhooks?.nodes ?? []
}

async function deleteWebhookById(
  ctx: LinearContext,
  id: string,
): Promise<void> {
  // Silme idempotent değil ama hedef tek bir id; retry duplicate riski yok.
  await linearGraphQL<{ webhookDelete: { success: boolean } }>(
    ctx,
    WEBHOOK_DELETE_MUTATION,
    { id },
    { retry: false },
  )
}

export type EnsureWebhookResult = {
  ok: true
  endpoint: string
  webhookId: string
  replaced: number
}

/**
 * Şirketin Linear webhook'unu kaydet (varsa yenile). Secret döndürülMEZ;
 * burada doğrudan cipher olarak linear_settings'e yazılır.
 */
export async function ensureWebhook(
  ctx: LinearContext,
  publicUrl?: string | null,
): Promise<EnsureWebhookResult> {
  // Secret'ı saklayamayacaksak Linear'da öksüz webhook YARATMA — önce kontrol.
  if (!isVaultConfigured()) {
    throw new LinearError(
      "SENTROY_ENV_MASTER_KEY tanımlı değil — webhook secret'ı saklanamaz",
      { status: 500 },
    )
  }

  const endpoint = linearWebhookEndpoint(ctx.companyId, publicUrl)

  // 1) Aynı endpoint'e kayıtlı mevcut webhook(lar)ı temizle.
  const existing = await listLinearWebhooks(ctx)
  const ours = existing.filter((w) => w.url === endpoint)
  for (const w of ours) {
    await deleteWebhookById(ctx, w.id)
  }

  // 2) Yeni secret üret + Linear'da webhook oluştur (non-idempotent → retry yok).
  const secret = randomBytes(32).toString("hex")
  const data = await linearGraphQL<{
    webhookCreate: { success: boolean; webhook: WebhookNode | null }
  }>(
    ctx,
    WEBHOOK_CREATE_MUTATION,
    {
      input: {
        url: endpoint,
        secret,
        resourceTypes: RESOURCE_TYPES,
        allPublicTeams: true,
        enabled: true,
        label: "Linear Lite",
      },
    },
    { retry: false },
  )

  if (!data.webhookCreate?.success || !data.webhookCreate.webhook) {
    throw new LinearError("Linear webhookCreate başarısız", { status: 502 })
  }

  const webhookId = data.webhookCreate.webhook.id

  // 3) Secret'ı cipher olarak şirket ayarlarına yaz (plaintext loglanmaz).
  await linearSettingsModel.upsertByCompany(ctx.companyId, {
    webhookSecretCipher: encryptValue(secret),
    webhookId,
  })

  return {
    ok: true,
    endpoint,
    webhookId,
    replaced: ours.length,
  }
}

export type DeleteWebhookResult = {
  ok: true
  /** Linear tarafında gerçekten bir webhook silindi mi. */
  deleted: boolean
}

/**
 * Şirketin kayıtlı webhook'unu Linear'dan siler ve local kaydı temizler.
 * Linear tarafında webhook zaten yoksa (elle silinmiş) hata fırlatmaz —
 * local temizlik yine yapılır.
 */
export async function deleteWebhook(
  ctx: LinearContext,
): Promise<DeleteWebhookResult> {
  const settings = await linearSettingsModel.findByCompany(ctx.companyId)
  const webhookId = settings?.webhookId ?? null

  let deleted = false
  if (webhookId) {
    try {
      await deleteWebhookById(ctx, webhookId)
      deleted = true
    } catch {
      // Linear'da kayıt bulunamadıysa/silinemiyorsa local temizliğe devam —
      // amaç bağlantıyı koparmak; öksüz id tutmanın faydası yok.
    }
  }

  await linearSettingsModel.upsertByCompany(ctx.companyId, {
    webhookSecretCipher: null,
    webhookId: null,
  })

  return { ok: true, deleted }
}
