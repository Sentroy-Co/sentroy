/**
 * Linear webhook alıcısı (PUBLIC — session yok; proxy.ts /api/* geçirir).
 * Triage api.linear.webhook portu, multi-tenant: endpoint şirkete özgü
 * (`/api/linear-webhook/{companyId}`), secret şirketin linear_settings
 * dokümanındaki cipher'dan decrypt edilir.
 *
 * Doğrulama: HMAC-SHA256(`Linear-Signature`) + timingSafeEqual. Doğrulanınca
 * SyncEvent üretilir → event bus'a publish (SSE abonelerine, açık sekme) +
 * `lastWebhookAt` işaretlenir (bağlantı sağlığı) + Web Push dispatch (kapalı
 * sekme/uygulama; VAPID tanımlıysa, fire-and-forget).
 */

import { NextRequest } from "next/server"
import { createHmac, timingSafeEqual } from "node:crypto"
import { linearSettingsModel } from "@workspace/db/models"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getDecryptedWebhookSecret, getUiFlagsForCompany } from "@/lib/settings"
import { publish, type SyncEvent } from "@/lib/event-bus"
import { dispatchPush } from "@/lib/push"
import { createLinearNotifications } from "@/lib/notify"
import { notifyTelegramOnIssueUpdate } from "@/lib/telegram/notify"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"

type LinearWebhookBody = {
  action?: string
  type?: string
  createdAt?: string
  data?: Record<string, unknown> | null
  // Some event types put the issue id on the parent rather than the resource:
  // e.g. a comment event carries data.issueId.
}

function verify(secret: string, raw: string, header: string | null): boolean {
  if (!header) return false
  try {
    const expected = createHmac("sha256", secret).update(raw).digest("hex")
    const a = Buffer.from(expected, "hex")
    const b = Buffer.from(header, "hex")
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

function pickIssueId(type: string, body: LinearWebhookBody): string | null {
  const d = body.data ?? {}
  if (type === "Issue") {
    const id = (d as { id?: unknown }).id
    return typeof id === "string" ? id : null
  }
  // Comment / Attachment / IssueRelation / IssueLabel events expose
  // issueId or issue.id depending on the resource.
  const flat = (d as { issueId?: unknown }).issueId
  if (typeof flat === "string") return flat
  const nested = (d as { issue?: { id?: unknown } }).issue?.id
  if (typeof nested === "string") return nested
  return null
}

function pickResourceId(body: LinearWebhookBody): string | null {
  const d = body.data ?? {}
  const id = (d as { id?: unknown }).id
  return typeof id === "string" ? id : null
}

function pickStateType(type: string, body: LinearWebhookBody): string | null {
  if (type !== "Issue") return null
  const d = body.data ?? {}
  const state = (d as { state?: { type?: unknown } }).state
  if (!state) return null
  const t = state.type
  return typeof t === "string" ? t : null
}

function pickIssueMeta(
  type: string,
  body: LinearWebhookBody,
): { identifier: string | null; title: string | null } {
  const d = body.data ?? {}
  if (type === "Issue") {
    const ident = (d as { identifier?: unknown }).identifier
    const title = (d as { title?: unknown }).title
    return {
      identifier: typeof ident === "string" ? ident : null,
      title: typeof title === "string" ? title : null,
    }
  }
  const issue = (d as { issue?: { identifier?: unknown; title?: unknown } })
    .issue
  if (issue) {
    return {
      identifier:
        typeof issue.identifier === "string" ? issue.identifier : null,
      title: typeof issue.title === "string" ? issue.title : null,
    }
  }
  return { identifier: null, title: null }
}

function pickActorName(body: LinearWebhookBody): string | null {
  const d = body.data ?? {}
  const candidates: unknown[] = [
    (d as { user?: { name?: unknown } }).user?.name,
    (d as { actor?: { name?: unknown } }).actor?.name,
    (d as { creator?: { name?: unknown } }).creator?.name,
  ]
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c
  }
  return null
}

// --- Kimlik id'leri (client-side "beni ilgilendiriyor mu" filtresi için) ---

function pickAssigneeId(type: string, body: LinearWebhookBody): string | null {
  const d = body.data ?? {}
  if (type === "Issue") {
    const id = (d as { assignee?: { id?: unknown } }).assignee?.id
    return typeof id === "string" ? id : null
  }
  // Comment vb. event'lerde Linear nested issue gönderiyorsa fırsatçı oku
  // (ekstra API çağrısı yok) — "benim talebime yorum" tespiti için.
  const nested = (d as { issue?: { assignee?: { id?: unknown } } }).issue
    ?.assignee?.id
  return typeof nested === "string" ? nested : null
}

function pickCreatorId(type: string, body: LinearWebhookBody): string | null {
  const d = body.data ?? {}
  if (type === "Issue" || type === "Attachment") {
    const id = (d as { creator?: { id?: unknown } }).creator?.id
    return typeof id === "string" ? id : null
  }
  const nested = (d as { issue?: { creator?: { id?: unknown } } }).issue
    ?.creator?.id
  return typeof nested === "string" ? nested : null
}

function pickCommentUserId(
  type: string,
  body: LinearWebhookBody,
): string | null {
  if (type !== "Comment") return null
  const id = (body.data as { user?: { id?: unknown } } | null)?.user?.id
  return typeof id === "string" ? id : null
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params

  // Şirketin webhook secret'ı yoksa (kayıtlı değil / master key eksik /
  // decrypt başarısız) imza doğrulanamaz — Linear retry etsin diye 503.
  const webhookSecret = await getDecryptedWebhookSecret(companyId)
  if (!webhookSecret) {
    return jsonError("Webhook secret not configured", 503)
  }

  const raw = await request.text()
  const signature = request.headers.get("Linear-Signature")

  if (!verify(webhookSecret, raw, signature)) {
    logger.warn({
      source: "linear",
      route: "linear-webhook",
      companyId,
      message: "invalid signature",
    })
    return jsonError("Invalid signature", 401)
  }

  // İmza doğrulandı → "son webhook alındı" zamanını işaretle (bağlantı
  // sağlığı). Fail-bypass: upsert hatası event akışını kırmasın.
  try {
    await linearSettingsModel.upsertByCompany(companyId, {
      lastWebhookAt: new Date(),
    })
  } catch (err) {
    logger.warn({
      source: "linear",
      route: "linear-webhook",
      companyId,
      message: `lastWebhookAt upsert failed: ${(err as Error).message}`,
    })
  }

  let body: LinearWebhookBody
  try {
    body = JSON.parse(raw) as LinearWebhookBody
  } catch {
    return jsonError("Invalid JSON", 400)
  }

  const type = body.type ?? "Unknown"
  const action = body.action ?? "update"
  const issueId = pickIssueId(type, body)
  const resourceId = pickResourceId(body)
  const stateType = pickStateType(type, body)
  const issueMeta = pickIssueMeta(type, body)
  const actorName = pickActorName(body)

  const event: SyncEvent = {
    type,
    action,
    issueId,
    resourceId,
    stateType,
    issueIdentifier: issueMeta.identifier,
    issueTitle: issueMeta.title,
    actorName,
    assigneeId: pickAssigneeId(type, body),
    creatorId: pickCreatorId(type, body),
    commentUserId: pickCommentUserId(type, body),
    at: Date.now(),
  }

  // Açık sekmelere SSE (in-page bildirim/zil) — anlık, yalnız bu şirketin
  // aboneleri (event bus companyId-keyed).
  publish(companyId, event)

  // İlgili alıcılara (assignee/creator/…): (1) Web Push — kapalı sekme;
  // (2) kalıcı in-app bildirim — Sentroy OS bildirim widget'ı + mail/storage
  // notification sheet. İkisi de şirketin bildirim flag'lerine göre, fire-and-
  // forget (hata 200'ü / Linear retry'ını engellemesin).
  void getUiFlagsForCompany(companyId)
    .then((flags) =>
      Promise.all([
        dispatchPush(companyId, event, flags),
        createLinearNotifications(companyId, event, flags),
      ]),
    )
    .catch((err) => {
      logger.warn({
        source: "linear",
        route: "linear-webhook",
        companyId,
        message: `notify dispatch failed: ${(err as Error).message}`,
      })
    })

  // Telegram bot bildirimi: bottan açılan talebin (linear_telegram_requests
  // eşleşmesi) durumu değiştiyse ilgili chat'e mesaj. Fire-and-forget —
  // hata Linear'ın 200 almasını engellemesin.
  void notifyTelegramOnIssueUpdate(companyId, body).catch((err) => {
    logger.warn({
      source: "telegram",
      route: "linear-webhook",
      companyId,
      message: `telegram notify failed: ${(err as Error).message}`,
    })
  })

  logger.info({
    source: "linear",
    route: "linear-webhook",
    companyId,
    type,
    action,
    issueId,
  })

  return jsonSuccess({ received: true })
}
