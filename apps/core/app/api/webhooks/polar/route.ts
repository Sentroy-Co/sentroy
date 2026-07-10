import { NextRequest, NextResponse } from "next/server"
import {
  validateEvent,
  WebhookVerificationError,
} from "@polar-sh/sdk/webhooks"
import { polarEventModel } from "@workspace/db/models"
import { audit } from "@workspace/console/lib/audit"
import {
  getPolarSettings,
  getWebhookSecret,
  type PolarMode,
} from "@/lib/polar/client"
import { handlePolarEvent } from "@/lib/polar/reconcile"
import { createHash } from "node:crypto"

// Node runtime — webhook imza doğrulaması crypto (standardwebhooks) kullanır.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/webhooks/polar — Polar Standard Webhooks alıcısı.
 *
 * Akış:
 *  1. Ham body (`request.text()`) — imza için bozulmamış byte gerekir.
 *  2. `validateEvent` ile imza doğrula. Sandbox ve production secret'ları
 *     ayrı; aktif mod önce denenir, başarısızsa diğer mod (sandbox testleri
 *     prod aktifken de çalışsın). Doğrulayan mod = event ortamı.
 *  3. `webhook-id` ile idempotency (Polar at-least-once teslim eder).
 *  4. `handlePolarEvent` → company abonelik state'i + plan limitleri.
 *  5. 202 hızlı dönüş (Polar ~10sn timeout, 10 retry).
 *
 * Auth yok — imza tabanlı. proxy.ts bu yolu CORS/auth'a takmadan geçirir.
 */
export async function POST(request: NextRequest) {
  const body = await request.text()
  const headers: Record<string, string> = {}
  request.headers.forEach((value, key) => {
    headers[key] = value
  })

  const settings = await getPolarSettings()
  const modes: PolarMode[] =
    settings.activeMode === "sandbox"
      ? ["sandbox", "production"]
      : ["production", "sandbox"]

  let event: { type: string; data: unknown } | null = null
  let verifiedMode: PolarMode | null = null
  let sawSecret = false

  for (const mode of modes) {
    const secret = getWebhookSecret(settings, mode)
    if (!secret) continue
    sawSecret = true
    try {
      event = validateEvent(body, headers, secret) as unknown as {
        type: string
        data: unknown
      }
      verifiedMode = mode
      break
    } catch (err) {
      if (err instanceof WebhookVerificationError) {
        // Bu mod'un secret'i değil — diğerini dene.
        continue
      }
      // İmza GEÇTİ ama SDK event tipini parse edemedi (bilinmeyen/yeni tip).
      // Ham JSON'dan type+data çıkarıp dispatch'e bırak (bizim handler
      // bilinmeyen tipte no-op yapar). İmza geçtiği için bu mod doğru.
      verifiedMode = mode
      try {
        const parsed = JSON.parse(body) as { type?: string; data?: unknown }
        event = { type: parsed.type ?? "unknown", data: parsed.data ?? {} }
      } catch {
        event = { type: "unknown", data: {} }
      }
      break
    }
  }

  if (!sawSecret) {
    // Hiç webhook secret yapılandırılmamış — Polar endpoint'i pasif sayar.
    return NextResponse.json({ error: "Polar not configured" }, { status: 503 })
  }
  if (!event || !verifiedMode) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 })
  }

  // Idempotency anahtarı: webhook-id (Standard Webhooks; imza doğrulaması
  // zaten varlığını gerektirir). Yoksa body-hash'e düş — randomUUID değil,
  // çünkü retry aynı body'yi gönderir; deterministik hash dedupe'u korur.
  const eventId =
    headers["webhook-id"] ?? createHash("sha256").update(body).digest("hex")

  // Idempotency — tekrar teslim edilen event'i atla.
  const existing = await polarEventModel.findByEventId(eventId)
  if (existing) {
    return NextResponse.json(
      { received: true, duplicate: true },
      { status: 202 },
    )
  }

  let record
  try {
    record = await polarEventModel.create({
      polarEventId: eventId,
      type: event.type,
      environment: verifiedMode,
      companyId: null,
      payload: event.data,
      processedAt: null,
      error: null,
    })
  } catch {
    // Unique index race — başka bir teslim aynı anda kaydetti. Ack.
    return NextResponse.json(
      { received: true, duplicate: true },
      { status: 202 },
    )
  }

  let companyId: string | null = null
  let error: string | null = null
  try {
    const result = await handlePolarEvent(event, verifiedMode)
    companyId = result.companyId
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
    console.error("[polar webhook] handler error:", error)
  }

  await polarEventModel.markProcessed(record.id, { companyId, error })

  await audit({
    userId: "system",
    companyId: companyId ?? undefined,
    action: `webhook.polar.${event.type}`,
    resource: "polar-subscription",
    resourceId: eventId,
    details: { environment: verifiedMode, type: event.type, error },
    request,
  }).catch(() => {})

  return NextResponse.json({ received: true }, { status: 202 })
}
