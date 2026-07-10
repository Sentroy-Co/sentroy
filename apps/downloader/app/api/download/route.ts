import { NextRequest, NextResponse } from "next/server"
import {
  peekRateLimit,
  consumeRateLimit,
  getClientIp,
} from "@workspace/console/lib/rate-limit"
import {
  isValidUrl,
  VIDEO_QUALITIES,
  AUDIO_FORMATS,
  type Platform,
} from "@/lib/platform"
import { DOWNLOAD_QUOTA } from "@/lib/quota"
import { workerUrl, workerHeaders, verifyTurnstile } from "@/lib/worker"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST { url, platform, kind, quality, title?, turnstileToken? }
 * → günlük kota (peek) + Turnstile → worker /download → başarıda kota tüket.
 * Response: { ...worker, remaining, quotaMax, resetAt }
 */
export async function POST(request: NextRequest) {
  // Peek (artırma yok) — başarılı indirmede consume edilir, böylece başarısız
  // denemeler günlük hakkı yakmaz.
  const peek = peekRateLimit(request, DOWNLOAD_QUOTA)
  if (!peek.allowed) {
    return NextResponse.json(
      { error: "quota", remaining: 0, quotaMax: DOWNLOAD_QUOTA.max, resetAt: peek.resetAt },
      { status: 429, headers: { "Retry-After": String(peek.retryAfter) } },
    )
  }

  let body: {
    url?: string
    platform?: string
    kind?: string
    quality?: string
    title?: string
    turnstileToken?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }
  // quality yalnız video/audio için zorunlu (instagram image/carousel/profile'da yok).
  if (!body.url || !body.platform || !body.kind) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 })
  }
  if (!isValidUrl(body.url, body.platform as Platform)) {
    return NextResponse.json({ error: "invalidUrl" }, { status: 400 })
  }
  const KINDS = ["video", "audio", "thumbnail", "image", "carousel", "profile"]
  if (!KINDS.includes(body.kind)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 })
  }
  // image/carousel/profile yalnız instagram'da.
  const isMedia = body.kind === "image" || body.kind === "carousel" || body.kind === "profile"
  if (isMedia && body.platform !== "instagram") {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 })
  }
  // quality kontrolü yalnız video/audio (thumbnail + media kind'lerde anlamsız).
  if (body.kind === "video" || body.kind === "audio") {
    const allowed =
      body.kind === "video"
        ? (VIDEO_QUALITIES as readonly string[])
        : (AUDIO_FORMATS as readonly string[])
    if (!body.quality || !allowed.includes(body.quality)) {
      return NextResponse.json({ error: "Invalid quality" }, { status: 400 })
    }
  }

  const human = await verifyTurnstile(body.turnstileToken, getClientIp(request))
  if (!human) {
    return NextResponse.json({ error: "verify" }, { status: 403 })
  }

  // ── video/audio/thumbnail → SSE: worker progress'ini client'a relay et,
  //    "done" olayında kotadan bir hak düş + remaining inject et. ──
  if (body.kind === "video" || body.kind === "audio" || body.kind === "thumbnail") {
    let wr: Response
    try {
      wr = await fetch(workerUrl("/download-stream"), {
        method: "POST",
        headers: workerHeaders(),
        body: JSON.stringify({
          url: body.url.trim(),
          platform: body.platform,
          kind: body.kind,
          quality: body.quality,
          title: body.title,
        }),
      })
    } catch {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 })
    }
    if (!wr.ok || !wr.body) {
      const d = await wr.json().catch(() => ({}))
      return NextResponse.json(d, { status: wr.status || 502 })
    }
    const reader = wr.body.getReader()
    const dec = new TextDecoder()
    const enc = new TextEncoder()
    let buf = ""
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const { done, value } = await reader.read()
        if (done) {
          controller.close()
          return
        }
        buf += dec.decode(value, { stream: true })
        const events = buf.split("\n\n")
        buf = events.pop() ?? ""
        for (const ev of events) {
          const line = ev.replace(/^data:\s*/, "").trim()
          if (!line) continue
          let obj: Record<string, unknown>
          try {
            obj = JSON.parse(line)
          } catch {
            continue
          }
          if (obj.type === "done") {
            const after = consumeRateLimit(request, DOWNLOAD_QUOTA)
            obj.remaining = after.remaining
            obj.quotaMax = DOWNLOAD_QUOTA.max
            obj.resetAt = after.resetAt
          }
          controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`))
        }
      },
      cancel() {
        reader.cancel().catch(() => {})
      },
    })
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    })
  }

  let res: Response
  try {
    res = await fetch(workerUrl("/download"), {
      method: "POST",
      headers: workerHeaders(),
      body: JSON.stringify({
        url: body.url.trim(),
        platform: body.platform,
        kind: body.kind,
        quality: body.quality,
        title: body.title,
      }),
    })
  } catch {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 })
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    // Başarısız indirme hakkı yakmaz.
    return NextResponse.json(data, { status: res.status })
  }
  // Başarılı → kotadan bir hak düş, kalanı response'a ekle.
  const after = consumeRateLimit(request, DOWNLOAD_QUOTA)
  return NextResponse.json(
    { ...data, remaining: after.remaining, quotaMax: DOWNLOAD_QUOTA.max, resetAt: after.resetAt },
    { status: 200 },
  )
}
