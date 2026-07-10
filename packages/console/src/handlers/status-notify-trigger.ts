import { NextRequest, NextResponse } from "next/server"
import { createHmac } from "node:crypto"
import {
  statusPageModel,
  statusIncidentModel,
  statusMaintenanceModel,
  statusSubscriberModel,
  statusNotifyDeliveryModel,
} from "@workspace/db/models"
import type { StatusSubscriber, SubscriberEventTopic } from "@workspace/db/models/status-subscriber"
import type { DeliveryChannel, DeliveryStatus } from "@workspace/db/models/status-notify-delivery"
import { pickLocalized } from "@workspace/db/types"
import { sendSystemMailEvent } from "@workspace/auth/server/system-mail-events"
import { verifyInternalRequest } from "@workspace/console/lib/internal-auth"
import { decryptValue } from "@workspace/console/lib/env-vault-crypto"
import { serverRootDomain, subAppOrigin } from "@workspace/auth/lib/domains"

/**
 * Internal notify trigger — worker (apps/status-worker) tarafından çağrılır.
 *
 * Workflow:
 *   1. Worker tick'te un-notified incident updates ve maintenance
 *      transitions tespit eder.
 *   2. Bu endpoint'lere internal HMAC ile POST atar.
 *   3. Handler subscribers find + mail + webhook dispatch + DB mark.
 *
 * Auth: x-internal-secret header (`INTERNAL_API_SECRET`). RP-facing
 * değil.
 *
 * Idempotency: handler markNotified çağırır; aynı incidentUpdateId/maintenance
 * için 2. çağrı no-op olur.
 */

const PUBLIC_BASE = (
  process.env.NEXT_PUBLIC_STATUS_APP_URL ||
  subAppOrigin(serverRootDomain(), "status")
).replace(/\/+$/, "")

interface WebhookPayload {
  event: string
  pageSlug: string
  data: Record<string, unknown>
  timestamp: string
}

interface TelegramMessage {
  title: string
  body: string
  /** Optional inline "Open" button URL. */
  url?: string
  urlLabel?: string
}

interface DispatchTrackingContext {
  pageId: string
  eventTopic: string
  reference: {
    type: "incident" | "maintenance"
    id: string
    updateId?: string
  }
}

interface DeliveryAttemptResult {
  status: DeliveryStatus
  httpStatus: number | null
  attempts: number
  errorMessage: string | null
}

async function recordDelivery(
  sub: StatusSubscriber,
  channel: DeliveryChannel,
  tracking: DispatchTrackingContext,
  result: DeliveryAttemptResult,
  latencyMs: number,
): Promise<void> {
  try {
    await statusNotifyDeliveryModel.record({
      pageId: tracking.pageId,
      subscriberId: sub.id,
      subscriberType: sub.type as DeliveryChannel,
      subscriberTarget: sub.target,
      channel,
      eventTopic: tracking.eventTopic,
      reference: tracking.reference,
      status: result.status,
      httpStatus: result.httpStatus,
      latencyMs,
      attempts: result.attempts,
      errorMessage: result.errorMessage,
    })
  } catch (err) {
    console.warn(
      "[notify] delivery record failed:",
      err instanceof Error ? err.message : err,
    )
  }
}

async function dispatchToSubscribers(
  subscribers: StatusSubscriber[],
  mailEventKey: string,
  mailVars: Record<string, string>,
  webhookPayload: WebhookPayload,
  telegramMessage: TelegramMessage,
  tracking: DispatchTrackingContext,
): Promise<{
  emailsSent: number
  webhooksSent: number
  telegramSent: number
  failures: number
}> {
  let emailsSent = 0
  let webhooksSent = 0
  let telegramSent = 0
  let failures = 0

  await Promise.allSettled(
    subscribers.map(async (sub) => {
      const unsubscribeUrl = `${PUBLIC_BASE}/api/v1/status/subscribe/unsubscribe?token=${sub.managementToken}`
      const preferencesUrl = `${PUBLIC_BASE}/p/${webhookPayload.pageSlug}/preferences?token=${sub.managementToken}`
      const startedAt = Date.now()
      try {
        if (sub.type === "email") {
          const result = await sendSystemMailEvent(mailEventKey, {
            to: sub.target,
            variables: { ...mailVars, unsubscribeUrl, preferencesUrl },
          })
          const latency = Date.now() - startedAt
          if (result.sent) {
            emailsSent++
            await recordDelivery(sub, "email", tracking, {
              status: "delivered",
              httpStatus: null,
              attempts: 1,
              errorMessage: null,
            }, latency)
          } else {
            failures++
            await recordDelivery(sub, "email", tracking, {
              status: "failed",
              httpStatus: null,
              attempts: 1,
              errorMessage: "system mail sender returned !sent",
            }, latency)
          }
        } else if (sub.type === "webhook") {
          const result = await deliverWebhook(sub, webhookPayload)
          const latency = Date.now() - startedAt
          if (result.status === "delivered") webhooksSent++
          else failures++
          await recordDelivery(sub, "webhook", tracking, result, latency)
        } else if (sub.type === "telegram") {
          const result = await deliverTelegram(sub, telegramMessage)
          const latency = Date.now() - startedAt
          if (result.status === "delivered") telegramSent++
          else failures++
          await recordDelivery(sub, "telegram", tracking, result, latency)
        }
      } catch (err) {
        const latency = Date.now() - startedAt
        failures++
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(
          `[notify] dispatch failed for ${sub.type}:${sub.target.slice(0, 40)}`,
          err,
        )
        await recordDelivery(sub, sub.type as DeliveryChannel, tracking, {
          status: "failed",
          httpStatus: null,
          attempts: 1,
          errorMessage: msg.slice(0, 500),
        }, latency)
      }
    }),
  )

  return { emailsSent, webhooksSent, telegramSent, failures }
}

/**
 * Telegram bot API'sine sendMessage çağırır. Bot token AES-GCM
 * decrypted, chat ID subscriber.target. Markdown V2 escape edilmesi
 * gereken karakterler için basit fallback (paragraph + link).
 */
async function deliverTelegram(
  sub: StatusSubscriber,
  msg: TelegramMessage,
): Promise<DeliveryAttemptResult> {
  if (!sub.telegramBotTokenEncrypted) {
    return {
      status: "failed",
      httpStatus: null,
      attempts: 0,
      errorMessage: "telegram bot token missing",
    }
  }
  let botToken: string
  try {
    botToken = decryptValue(sub.telegramBotTokenEncrypted)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.warn(`[notify] telegram token decrypt failed for sub ${sub.id}: ${errMsg}`)
    return {
      status: "failed",
      httpStatus: null,
      attempts: 0,
      errorMessage: `decrypt failed: ${errMsg}`.slice(0, 500),
    }
  }

  // Markdown V2: özel karakterler escape (`_*[]()~`>#+-=|{}.!`)
  const escapeMd = (s: string) =>
    s.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1")
  const lines = [`*${escapeMd(msg.title)}*`]
  if (msg.body) lines.push("", escapeMd(msg.body))
  if (msg.url && msg.urlLabel) {
    lines.push("", `[${escapeMd(msg.urlLabel)}](${msg.url})`)
  }
  const text = lines.join("\n")

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: sub.target,
          text,
          parse_mode: "MarkdownV2",
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    )
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      console.warn(
        `[notify] telegram sendMessage ${res.status} chat=${sub.target.slice(0, 20)}: ${body.slice(0, 200)}`,
      )
      return {
        status: "failed",
        httpStatus: res.status,
        attempts: 1,
        errorMessage: `HTTP ${res.status}: ${body.slice(0, 400)}`,
      }
    }
    return {
      status: "delivered",
      httpStatus: res.status,
      attempts: 1,
      errorMessage: null,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[notify] telegram dispatch error for ${sub.id}: ${msg}`)
    return {
      status: "failed",
      httpStatus: null,
      attempts: 1,
      errorMessage: msg.slice(0, 500),
    }
  }
}

/**
 * Webhook delivery — HMAC-SHA256 signed POST + 3 attempt (basic backoff
 * 0/2/10s). Subscriber'ın `webhookSecret`'i ile imzalanır (hash DB'de,
 * plaintext yalnız create response'unda; bu yüzden imzalamak için
 * subscriber.webhookSecretHash'i kullanamayız — bu hash, plaintext'i
 * geri vermez).
 *
 * Pratik çözüm: subscriber.managementToken'i secret olarak kullan
 * (zaten 48 hex random, secret entropy yeterli). Subscriber'ın doc'unda
 * yer alıyor, hash'lenmiş değil — plaintext signature için bizim
 * kullanım scope'umuzla uyumlu.
 */
async function deliverWebhook(
  sub: StatusSubscriber,
  payload: WebhookPayload,
): Promise<DeliveryAttemptResult> {
  const body = JSON.stringify(payload)
  const signature = createHmac("sha256", sub.managementToken)
    .update(body)
    .digest("hex")

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "sentroy-status-webhook/1.0",
    "X-Sentroy-Event": payload.event,
    "X-Sentroy-Signature": `sha256=${signature}`,
    "X-Sentroy-Delivery-Id": `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  }

  const delays = [0, 2_000, 10_000]
  let lastHttpStatus: number | null = null
  let lastError: string | null = null
  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt] > 0) {
      await new Promise((r) => setTimeout(r, delays[attempt]))
    }
    try {
      const res = await fetch(sub.target, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(10_000),
      })
      lastHttpStatus = res.status
      if (res.ok) {
        return {
          status: "delivered",
          httpStatus: res.status,
          attempts: attempt + 1,
          errorMessage: null,
        }
      }
      if (res.status < 500 && res.status !== 429) {
        // 4xx (except 429) — client error, retry yardımcı olmaz
        const txt = await res.text().catch(() => "")
        return {
          status: "failed",
          httpStatus: res.status,
          attempts: attempt + 1,
          errorMessage: `HTTP ${res.status}: ${txt.slice(0, 400)}`,
        }
      }
      lastError = `HTTP ${res.status} (retried)`
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      // Network error — retry
    }
  }
  return {
    status: "failed",
    httpStatus: lastHttpStatus,
    attempts: delays.length,
    errorMessage: (lastError ?? "exhausted retries").slice(0, 500),
  }
}

// ─── Incident update notify ───────────────────────────────────────────────

export async function notifyIncidentUpdatePost(request: NextRequest) {
  const ok = await verifyInternalRequest(request)
  if (!ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  let body: { incidentId?: string; updateId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }
  if (!body.incidentId || !body.updateId) {
    return NextResponse.json(
      { error: "incidentId and updateId required" },
      { status: 400 },
    )
  }

  const incident = await statusIncidentModel.findById(body.incidentId)
  if (!incident) {
    return NextResponse.json({ error: "incident not found" }, { status: 404 })
  }
  const update = incident.updates.find((u) => u.id === body.updateId)
  if (!update) {
    return NextResponse.json({ error: "update not found" }, { status: 404 })
  }
  if (update.notifiedAt) {
    return NextResponse.json({ skipped: "already notified" })
  }

  const page = await statusPageModel.findById(incident.pageId)
  if (!page || !page.subscribersEnabled) {
    // Subscribers disabled — yine de mark et ki tekrar denenmesin
    await statusIncidentModel.markUpdateNotified(incident.id, update.id)
    return NextResponse.json({ skipped: "subscribers disabled" })
  }

  const topic: SubscriberEventTopic =
    update.status === "resolved"
      ? "incident.resolved"
      : incident.updates[0]?.id === update.id
        ? "incident.opened"
        : "incident.updated"

  const subscribers = await statusSubscriberModel.findActiveByPage(page.id, {
    topic,
  })
  // Component filter — subscriber componentFilter belirtmişse, incident
  // bir affected component ile kesişmiyorsa skip.
  const filtered = subscribers.filter((s) => {
    if (s.componentFilter.length === 0) return true
    return s.componentFilter.some((cid) =>
      incident.affectedComponentIds.includes(cid),
    )
  })

  const pageUrl = `${PUBLIC_BASE}/p/${page.slug}`
  // Localization — subscriber per-locale yok v1; default page locale (en).
  const titleStr = pickLocalized(incident.title, "en")
  const bodyStr = pickLocalized(update.body, "en")

  const result = await dispatchToSubscribers(
    filtered,
    "status.subscriber.incident-update",
    {
      pageName: page.branding.displayName || page.name,
      incidentTitle: titleStr,
      updateStatus: update.status,
      updateBody: bodyStr,
      incidentUrl: pageUrl,
    },
    {
      event: `incident.${update.status === "resolved" ? "resolved" : "updated"}`,
      pageSlug: page.slug,
      data: {
        incidentId: incident.id,
        incidentTitle: incident.title,
        impact: incident.impact,
        affectedComponentIds: incident.affectedComponentIds,
        update: {
          id: update.id,
          status: update.status,
          body: update.body,
          createdAt: update.createdAt,
        },
      },
      timestamp: new Date().toISOString(),
    },
    {
      title: `[${update.status.toUpperCase()}] ${titleStr}`,
      body: bodyStr,
      url: pageUrl,
      urlLabel: "View status page",
    },
    {
      pageId: page.id,
      eventTopic: topic,
      reference: { type: "incident", id: incident.id, updateId: update.id },
    },
  )

  await statusIncidentModel.markUpdateNotified(incident.id, update.id)

  return NextResponse.json({ delivered: result, subscriberCount: filtered.length })
}

// ─── Maintenance notify ───────────────────────────────────────────────────

type MaintenanceEventKind = "scheduled" | "reminder" | "started" | "completed"

const MAINTENANCE_EVENT_MAP: Record<
  MaintenanceEventKind,
  { mailKey: string; topic: SubscriberEventTopic; webhookEvent: string }
> = {
  scheduled: {
    mailKey: "status.subscriber.maintenance-scheduled",
    topic: "maintenance.scheduled",
    webhookEvent: "maintenance.scheduled",
  },
  reminder: {
    mailKey: "status.subscriber.maintenance-reminder",
    topic: "maintenance.reminder",
    webhookEvent: "maintenance.reminder",
  },
  started: {
    mailKey: "status.subscriber.maintenance-started",
    topic: "maintenance.started",
    webhookEvent: "maintenance.started",
  },
  completed: {
    mailKey: "status.subscriber.maintenance-completed",
    topic: "maintenance.completed",
    webhookEvent: "maintenance.completed",
  },
}

const MAINTENANCE_FLAG_MAP: Record<MaintenanceEventKind, "notifiedReminder" | "notifiedStarted" | "notifiedCompleted" | null> = {
  scheduled: null, // "scheduled" notify ayrı flag tutmuyoruz (Phase 5.4 model)
  reminder: "notifiedReminder",
  started: "notifiedStarted",
  completed: "notifiedCompleted",
}

export async function notifyMaintenancePost(request: NextRequest) {
  const ok = await verifyInternalRequest(request)
  if (!ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  let body: { maintenanceId?: string; event?: MaintenanceEventKind }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }
  if (!body.maintenanceId || !body.event) {
    return NextResponse.json(
      { error: "maintenanceId and event required" },
      { status: 400 },
    )
  }
  const event = body.event
  const cfg = MAINTENANCE_EVENT_MAP[event]
  if (!cfg) {
    return NextResponse.json({ error: "invalid event" }, { status: 400 })
  }

  const maintenance = await statusMaintenanceModel.findById(body.maintenanceId)
  if (!maintenance) {
    return NextResponse.json({ error: "maintenance not found" }, { status: 404 })
  }

  // Check flag (idempotency)
  const flagKey = MAINTENANCE_FLAG_MAP[event]
  if (flagKey && maintenance[flagKey]) {
    return NextResponse.json({ skipped: "already notified" })
  }

  const page = await statusPageModel.findById(maintenance.pageId)
  if (!page || !page.subscribersEnabled) {
    if (flagKey) {
      await statusMaintenanceModel.markNotified(
        maintenance.id,
        event === "started" ? "started" : event === "completed" ? "completed" : "reminder",
      )
    }
    return NextResponse.json({ skipped: "subscribers disabled" })
  }

  const subscribers = await statusSubscriberModel.findActiveByPage(page.id, {
    topic: cfg.topic,
  })
  const filtered = subscribers.filter((s) => {
    if (s.componentFilter.length === 0) return true
    return s.componentFilter.some((cid) =>
      maintenance.affectedComponentIds.includes(cid),
    )
  })

  const pageUrl = `${PUBLIC_BASE}/p/${page.slug}`
  const titleStr = pickLocalized(maintenance.title, "en")
  const descStr = pickLocalized(maintenance.description, "en")
  const startStr = maintenance.scheduledStart.toUTCString()
  const endStr = maintenance.scheduledEnd.toUTCString()

  const mailVars: Record<string, string> = {
    pageName: page.branding.displayName || page.name,
    maintenanceTitle: titleStr,
    maintenanceDescription: descStr,
    scheduledStart: startStr,
    scheduledEnd: endStr,
    pageUrl,
  }

  const result = await dispatchToSubscribers(
    filtered,
    cfg.mailKey,
    mailVars,
    {
      event: cfg.webhookEvent,
      pageSlug: page.slug,
      data: {
        maintenanceId: maintenance.id,
        title: maintenance.title,
        description: maintenance.description,
        scheduledStart: maintenance.scheduledStart,
        scheduledEnd: maintenance.scheduledEnd,
        status: maintenance.status,
        affectedComponentIds: maintenance.affectedComponentIds,
      },
      timestamp: new Date().toISOString(),
    },
    {
      title: `[${event.toUpperCase()}] ${titleStr}`,
      body: `${startStr} → ${endStr}\n\n${descStr}`,
      url: pageUrl,
      urlLabel: "View status page",
    },
    {
      pageId: page.id,
      eventTopic: cfg.topic,
      reference: { type: "maintenance", id: maintenance.id },
    },
  )

  if (flagKey) {
    await statusMaintenanceModel.markNotified(
      maintenance.id,
      event === "started" ? "started" : event === "completed" ? "completed" : "reminder",
    )
  }

  return NextResponse.json({
    delivered: result,
    subscriberCount: filtered.length,
  })
}
