import { NextRequest, NextResponse } from "next/server"
import {
  statusPageModel,
  statusSubscriberModel,
} from "@workspace/db/models"
import { sendSystemMailEvent } from "@workspace/auth/server/system-mail-events"
import { encryptValue, isVaultConfigured } from "@workspace/console/lib/env-vault-crypto"
import { verifyTurnstileToken } from "@workspace/auth/server/security-protections"
import { serverRootDomain, subAppOrigin } from "@workspace/auth/lib/domains"

/**
 * Public Subscribers API — no auth, CORS-open. Public status page'in
 * "Subscribe to updates" widget'ından kullanılır.
 *
 * Flow:
 *   1. POST /api/v1/status/[slug]/subscribe { email | webhookUrl, type } →
 *      pending subscriber + verify mail (email) veya hemen active (webhook).
 *   2. GET /api/v1/status/subscribe/verify?token=X → verified=true + redirect
 *      to /p/[slug]/subscribed
 *   3. GET /api/v1/status/subscribe/unsubscribe?token=X → unsubscribedAt set +
 *      redirect to /p/[slug]/unsubscribed
 *
 * Webhook subscribe: verify zorunlu değil çünkü URL sahibinin secret'ı vardır
 * (paylaşımı implicit consent). HMAC payload imzası için secret response'ta
 * bir kez döner.
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * In-memory rate limiter — public subscribe abuse savunması. Per-IP
 * sliding window: max RATE_LIMIT_MAX subscribe / RATE_LIMIT_WINDOW_MS.
 *
 * v1 sınırı (basit): tek Node.js process'te in-memory Map. Multi-instance
 * worker veya horizontal scale durumunda her instance kendi sayacını
 * tutar (max etkili limit instance_count × RATE_LIMIT_MAX). Tek-instance
 * scenario'da yeterli; sonradan Redis upgrade.
 */
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // 1 saat
const RATE_LIMIT_MAX = 10 // saatte 10 subscribe / IP
const rateLimitBuckets = new Map<string, number[]>() // ip → timestamps[]
let lastRateLimitGc = 0

function getClientIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for")
  if (xff) return xff.split(",")[0]?.trim() ?? "unknown"
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("cf-connecting-ip") ??
    "unknown"
  )
}

function checkRateLimit(ip: string): {
  allowed: boolean
  remaining: number
  resetMs: number
} {
  const now = Date.now()

  // GC stale bucket'lar — her 5dk'da bir, opportunistic
  if (now - lastRateLimitGc > 5 * 60 * 1000) {
    lastRateLimitGc = now
    for (const [key, times] of rateLimitBuckets.entries()) {
      const filtered = times.filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
      if (filtered.length === 0) rateLimitBuckets.delete(key)
      else rateLimitBuckets.set(key, filtered)
    }
  }

  const bucket = (rateLimitBuckets.get(ip) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  )
  if (bucket.length >= RATE_LIMIT_MAX) {
    const oldest = bucket[0]!
    return {
      allowed: false,
      remaining: 0,
      resetMs: RATE_LIMIT_WINDOW_MS - (now - oldest),
    }
  }
  bucket.push(now)
  rateLimitBuckets.set(ip, bucket)
  return {
    allowed: true,
    remaining: RATE_LIMIT_MAX - bucket.length,
    resetMs: RATE_LIMIT_WINDOW_MS,
  }
}

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  }
}

export async function subscribeOptions(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: corsHeaders() })
}

// ─── Subscribe ────────────────────────────────────────────────────────────

export async function subscribePost(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  // Rate limit FIRST — minimum work before reject (page lookup spare).
  const ip = getClientIp(request)
  const rl = checkRateLimit(ip)
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: `Too many subscribe attempts from this IP. Try again in ${Math.ceil(rl.resetMs / 60000)} minutes.`,
      },
      {
        status: 429,
        headers: {
          ...corsHeaders(),
          "Retry-After": String(Math.ceil(rl.resetMs / 1000)),
        },
      },
    )
  }

  const { slug } = await params
  const page = await statusPageModel.findBySlug(slug)
  if (!page || !page.enabled) {
    return NextResponse.json(
      { error: "status page not found" },
      { status: 404, headers: corsHeaders() },
    )
  }
  if (!page.subscribersEnabled) {
    return NextResponse.json(
      { error: "subscribers disabled for this page" },
      { status: 403, headers: corsHeaders() },
    )
  }

  let body: {
    type?: "email" | "webhook" | "telegram"
    email?: string
    webhookUrl?: string
    telegram?: { chatId?: string; botToken?: string }
    componentFilter?: string[]
    topicFilter?: string[]
    cfTurnstileToken?: string | null
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: corsHeaders() },
    )
  }

  // Turnstile CAPTCHA — YALNIZ site key yapılandırılmışsa enforce et. Site key
  // yoksa form'da widget hiç render olmuyor (kullanıcı token üretemez), o yüzden
  // server'ın token beklemesi garantili "captcha hatası"na yol açardı. Client +
  // server aynı koşula bağlanır: site key varsa widget çıkar → captcha zorunlu;
  // yoksa ikisi de atlar. (Secret ayrıca yoksa verifyTurnstileToken zaten no-op.)
  if (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
    const turnstileResult = await verifyTurnstileToken(body.cfTurnstileToken, ip)
    if (!turnstileResult.ok) {
      return NextResponse.json(
        { error: `Captcha verification failed (${turnstileResult.reason})` },
        { status: 403, headers: corsHeaders() },
      )
    }
  }

  const type: "email" | "webhook" | "telegram" =
    body.type === "webhook" || body.type === "telegram" ? body.type : "email"

  let target: string
  let telegramBotTokenEncrypted: string | undefined

  if (type === "email") {
    target = (body.email ?? "").trim().toLowerCase()
    if (!EMAIL_REGEX.test(target)) {
      return NextResponse.json(
        { error: "valid email required" },
        { status: 400, headers: corsHeaders() },
      )
    }
  } else if (type === "webhook") {
    target = (body.webhookUrl ?? "").trim()
    if (!/^https?:\/\//.test(target)) {
      return NextResponse.json(
        { error: "webhookUrl must start with http:// or https://" },
        { status: 400, headers: corsHeaders() },
      )
    }
  } else {
    // telegram
    const chatId = (body.telegram?.chatId ?? "").trim()
    const botToken = (body.telegram?.botToken ?? "").trim()
    if (!chatId) {
      return NextResponse.json(
        { error: "telegram.chatId required" },
        { status: 400, headers: corsHeaders() },
      )
    }
    if (!/^\d+:[A-Za-z0-9_-]{30,}$/.test(botToken)) {
      return NextResponse.json(
        { error: "telegram.botToken format invalid (expected <id>:<hash>)" },
        { status: 400, headers: corsHeaders() },
      )
    }
    if (!isVaultConfigured()) {
      return NextResponse.json(
        { error: "SENTROY_ENV_MASTER_KEY not configured — cannot encrypt bot token" },
        { status: 500, headers: corsHeaders() },
      )
    }

    // Test: bot'a sendMessage at — chat valid + bot kullanıcıya yazabiliyor mu.
    try {
      const testRes = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: `✅ ${page.branding.displayName || page.name} status notifications enabled. You'll receive incident updates and scheduled maintenance alerts here.`,
            disable_web_page_preview: true,
          }),
          signal: AbortSignal.timeout(10_000),
        },
      )
      if (!testRes.ok) {
        const err = (await testRes.json().catch(() => ({}))) as {
          description?: string
        }
        return NextResponse.json(
          {
            error: `Telegram setup failed: ${err.description ?? "could not deliver test message — check bot token + chat ID; chat owner must /start the bot first"}`,
          },
          { status: 400, headers: corsHeaders() },
        )
      }
    } catch (err) {
      return NextResponse.json(
        {
          error: `Telegram test send failed: ${err instanceof Error ? err.message : "network error"}`,
        },
        { status: 500, headers: corsHeaders() },
      )
    }

    target = chatId
    telegramBotTokenEncrypted = encryptValue(botToken)
  }

  // Idempotent: aynı target zaten varsa duplicate yarat ma, sessizce
  // "already subscribed" cevabı ver (email enumeration timing parite).
  const existing = await statusSubscriberModel.findByTarget(page.id, type, target)
  if (existing && existing.unsubscribedAt === null) {
    return NextResponse.json(
      {
        message: existing.verified
          ? "already subscribed"
          : "verification email already sent — check your inbox",
      },
      { status: 200, headers: corsHeaders() },
    )
  }

  // Yeni veya resubscribe (unsubscribed) — re-subscribe için yeni token.
  let result: Awaited<ReturnType<typeof statusSubscriberModel.create>>
  if (existing && existing.unsubscribedAt !== null) {
    // Reset: aynı kayıtı silip yeniden create (managementToken yenilenmesi için)
    await statusSubscriberModel.remove(existing.id)
  }
  try {
    const validTopics = new Set([
      "incident.opened",
      "incident.updated",
      "incident.resolved",
      "maintenance.scheduled",
      "maintenance.reminder",
      "maintenance.started",
      "maintenance.completed",
    ])
    result = await statusSubscriberModel.create({
      pageId: page.id,
      type,
      target,
      componentFilter: Array.isArray(body.componentFilter)
        ? body.componentFilter.filter((id) => typeof id === "string")
        : [],
      topicFilter: Array.isArray(body.topicFilter)
        ? (body.topicFilter.filter(
            (t): t is string =>
              typeof t === "string" && validTopics.has(t),
          ) as Parameters<typeof statusSubscriberModel.create>[0]["topicFilter"])
        : [],
      telegramBotTokenEncrypted,
    })
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "could not create subscriber",
      },
      { status: 500, headers: corsHeaders() },
    )
  }

  const { subscriber, webhookSecret } = result

  // Email: send verify mail (double opt-in)
  if (type === "email") {
    // E-posta linkleri PUBLIC status URL'ine gitmeli. `request.url` reverse-proxy
    // arkasında container'ın internal bind'ini (ör. 0.0.0.0:3004) verir → mail'de
    // tıklanamaz. ROOT_DOMAIN'den türet (env override'lı, portable).
    const origin =
      process.env.NEXT_PUBLIC_STATUS_APP_URL ||
      subAppOrigin(serverRootDomain(), "status")
    const verifyUrl = `${origin}/api/v1/status/subscribe/verify?token=${subscriber.managementToken}`
    const unsubscribeUrl = `${origin}/api/v1/status/subscribe/unsubscribe?token=${subscriber.managementToken}`
    try {
      const result = await sendSystemMailEvent("status.subscriber.verify-email", {
        to: target,
        variables: {
          pageName: page.branding.displayName || page.name,
          subscriberEmail: target,
          verifyUrl,
          unsubscribeUrl,
        },
      })
      if (!result.sent) {
        console.warn(
          `[status-subscriber] verify mail NOT sent to ${target}: reason="${result.reason}"`,
        )
      } else {
        console.log(`[status-subscriber] verify mail sent to ${target}`)
      }
    } catch (err) {
      console.warn("[status-subscriber] verify mail send threw:", err)
      // Mail fail olsa bile subscriber yaratıldı — user retry edebilir
    }
    return NextResponse.json(
      { message: "verification email sent" },
      { status: 201, headers: corsHeaders() },
    )
  }

  if (type === "telegram") {
    return NextResponse.json(
      {
        message: "telegram subscribed — check your chat for the confirmation message",
        managementToken: subscriber.managementToken,
        subscriberId: subscriber.id,
      },
      { status: 201, headers: corsHeaders() },
    )
  }

  // Webhook: secret bir kez dön
  return NextResponse.json(
    {
      message: "webhook subscribed",
      managementToken: subscriber.managementToken,
      webhookSecret,
      subscriberId: subscriber.id,
    },
    { status: 201, headers: corsHeaders() },
  )
}

// ─── Verify (email subscribers only) ──────────────────────────────────────

export async function verifyGet(request: NextRequest) {
  const url = new URL(request.url)
  const token = url.searchParams.get("token")
  if (!token) {
    return NextResponse.json(
      { error: "token required" },
      { status: 400, headers: corsHeaders() },
    )
  }

  const subscriber = await statusSubscriberModel.findByManagementToken(token)
  if (!subscriber) {
    return NextResponse.redirect(new URL("/p/subscribe-error", url.origin))
  }

  const page = await statusPageModel.findById(subscriber.pageId)
  const pageSlug = page?.slug ?? "unknown"

  if (subscriber.verified) {
    return NextResponse.redirect(
      new URL(`/p/${pageSlug}/subscribed?already=1`, url.origin),
    )
  }

  await statusSubscriberModel.verify(token)
  return NextResponse.redirect(new URL(`/p/${pageSlug}/subscribed`, url.origin))
}

// ─── Unsubscribe ──────────────────────────────────────────────────────────

// ─── Preferences (token-based; subscriber kendi tercihlerini güncelliyor) ─

export async function preferencesGet(request: NextRequest) {
  const url = new URL(request.url)
  const token = url.searchParams.get("token")
  if (!token) {
    return NextResponse.json(
      { error: "token required" },
      { status: 400, headers: corsHeaders() },
    )
  }

  const subscriber = await statusSubscriberModel.findByManagementToken(token)
  if (!subscriber || subscriber.unsubscribedAt) {
    return NextResponse.json(
      { error: "subscriber not found or unsubscribed" },
      { status: 404, headers: corsHeaders() },
    )
  }

  const page = await statusPageModel.findById(subscriber.pageId)
  if (!page) {
    return NextResponse.json(
      { error: "page not found" },
      { status: 404, headers: corsHeaders() },
    )
  }

  // Page'in components'ini de döner ki UI chip listesini render edebilsin.
  const { statusComponentModel } = await import("@workspace/db/models")
  const components = await statusComponentModel.findByPage(page.id, {
    onlyVisible: true,
  })

  return NextResponse.json(
    {
      subscriber: {
        type: subscriber.type,
        target: subscriber.target,
        verified: subscriber.verified,
        componentFilter: subscriber.componentFilter,
        topicFilter: subscriber.topicFilter,
        createdAt: subscriber.createdAt,
      },
      page: {
        slug: page.slug,
        name: page.name,
        branding: page.branding,
      },
      components: components.map((c) => ({ id: c.id, name: c.name })),
    },
    { headers: corsHeaders() },
  )
}

export async function preferencesPatch(request: NextRequest) {
  let body: {
    token?: string
    componentFilter?: string[]
    topicFilter?: string[]
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: corsHeaders() },
    )
  }

  if (typeof body.token !== "string" || !body.token) {
    return NextResponse.json(
      { error: "token required" },
      { status: 400, headers: corsHeaders() },
    )
  }

  const subscriber = await statusSubscriberModel.findByManagementToken(body.token)
  if (!subscriber || subscriber.unsubscribedAt) {
    return NextResponse.json(
      { error: "subscriber not found or unsubscribed" },
      { status: 404, headers: corsHeaders() },
    )
  }

  const patch: {
    componentFilter?: string[]
    topicFilter?: ("incident.opened" | "incident.updated" | "incident.resolved" | "maintenance.scheduled" | "maintenance.reminder" | "maintenance.started" | "maintenance.completed")[]
  } = {}

  if (Array.isArray(body.componentFilter)) {
    patch.componentFilter = body.componentFilter.filter(
      (id) => typeof id === "string",
    )
  }
  if (Array.isArray(body.topicFilter)) {
    const validTopics = new Set([
      "incident.opened",
      "incident.updated",
      "incident.resolved",
      "maintenance.scheduled",
      "maintenance.reminder",
      "maintenance.started",
      "maintenance.completed",
    ])
    patch.topicFilter = body.topicFilter.filter(
      (t): t is (typeof patch.topicFilter & {})[number] =>
        typeof t === "string" && validTopics.has(t),
    )
  }

  const updated = await statusSubscriberModel.updateFilters(subscriber.id, patch)
  if (!updated) {
    return NextResponse.json(
      { error: "update failed" },
      { status: 500, headers: corsHeaders() },
    )
  }

  return NextResponse.json(
    {
      componentFilter: updated.componentFilter,
      topicFilter: updated.topicFilter,
    },
    { headers: corsHeaders() },
  )
}

export async function unsubscribeGet(request: NextRequest) {
  const url = new URL(request.url)
  const token = url.searchParams.get("token")
  if (!token) {
    return NextResponse.json(
      { error: "token required" },
      { status: 400, headers: corsHeaders() },
    )
  }

  const subscriber = await statusSubscriberModel.findByManagementToken(token)
  if (!subscriber) {
    return NextResponse.redirect(new URL("/p/subscribe-error", url.origin))
  }

  const page = await statusPageModel.findById(subscriber.pageId)
  const pageSlug = page?.slug ?? "unknown"

  if (subscriber.unsubscribedAt) {
    return NextResponse.redirect(
      new URL(`/p/${pageSlug}/unsubscribed?already=1`, url.origin),
    )
  }

  await statusSubscriberModel.unsubscribe(token)
  return NextResponse.redirect(
    new URL(`/p/${pageSlug}/unsubscribed`, url.origin),
  )
}
