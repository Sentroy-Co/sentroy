import { NextRequest } from "next/server"
import { jsonError } from "@workspace/console/lib/api-helpers"
import { getSentroyForInbox } from "@/lib/inbox-access"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Server-Sent Events proxy — sentroy-api'nin /inbox/events stream'ini
 * kullanıcıya pass-through eder. Yetki kontrolü burada yapılır:
 *   - mailbox param verilmişse: `inbox.mailbox:<email>` veya `inbox.view`
 *   - verilmemişse: `inbox.view` (tüm kutuları dinleme yetkisi)
 *
 * Bağlantı koptuğunda (browser kapatırsa) upstream fetch'e abort sinyali gider.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const mailbox = request.nextUrl.searchParams.get("mailbox") || undefined

  const result = await getSentroyForInbox(request, slug, mailbox)
  if ("error" in result && result.error) return result.error

  const company = result.company as { sentroyApiKey?: string } | undefined
  const apiKey = company?.sentroyApiKey
  if (!apiKey) return jsonError("Mail server API key missing", 400)

  const upstreamBase =
    process.env.SENTROY_MAIL_API_URL ||
    process.env.NEXT_PUBLIC_SENTROY_API_URL ||
    "http://localhost:3000/api/v1"
  const base = upstreamBase.replace(/\/api\/v1\/?$/, "") + "/api/v1"
  const qs = mailbox ? `?mailbox=${encodeURIComponent(mailbox)}` : ""
  const upstreamUrl = `${base}/inbox/events${qs}`

  // Client disconnect → upstream fetch'i iptal
  const abortController = new AbortController()
  request.signal.addEventListener("abort", () => abortController.abort())

  let upstream: Response
  try {
    upstream = await fetch(upstreamUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "text/event-stream",
      },
      signal: abortController.signal,
      cache: "no-store",
    })
  } catch (err) {
    console.warn(
      `[inbox/events] upstream connect failed for ${upstreamUrl}:`,
      err instanceof Error ? err.message : err,
    )
    // 503 + Retry-After tells the browser's EventSource to back off
    // before reconnecting instead of hammering us in a tight loop. We
    // also surface the upstream URL we tried — useful when the env
    // var is misconfigured and the message lands in the user's
    // network tab.
    return new Response(
      JSON.stringify({
        data: null,
        error: "Mail server unreachable",
        upstream: new URL(upstreamUrl).host,
      }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "30",
        },
      },
    )
  }

  if (!upstream.ok || !upstream.body) {
    console.warn(
      `[inbox/events] upstream ${upstream.status} for ${upstreamUrl}`,
    )
    // Same backoff treatment — most 502/503/504 from upstream are
    // transient (mail-server restart, IMAP pool exhausted, Redis
    // down). Translate into a single 503 so EventSource treats them
    // uniformly and respects Retry-After.
    if (upstream.status >= 502 && upstream.status <= 504) {
      return new Response(
        JSON.stringify({
          data: null,
          error: "Mail server temporarily unavailable",
          upstreamStatus: upstream.status,
        }),
        {
          status: 503,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "30",
          },
        },
      )
    }
    return jsonError(
      `Upstream returned ${upstream.status}`,
      upstream.status || 502,
    )
  }

  // Stream pass-through — upstream bytes'ları browser'a aynen geçir
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
