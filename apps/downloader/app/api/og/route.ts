import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

/**
 * GET /api/og?url=<page> — Open Graph / meta önizleme verisi (server-side fetch;
 * CORS yüzünden client'tan yapılamaz). SSRF korumalı: yalnız http(s), public
 * host; localhost/private IP/metadata blokludur; redirect'ler manuel ve her
 * hop yeniden doğrulanır; timeout + boyut sınırı. Bu route core'a rewrite
 * EDİLMEZ (downloader kendi serve eder); Mongo/secret kullanmaz.
 */

const MAX_BYTES = 512 * 1024
const MAX_HOPS = 4
const TIMEOUT_MS = 8000

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "")
  if (!h || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const a = Number(v4[1]), b = Number(v4[2])
    if (a === 0 || a === 10 || a === 127 || a >= 224) return true
    if (a === 169 && b === 254) return true // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
  }
  // IPv6 loopback / unique-local / link-local
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80") || h.startsWith("::ffff:")) return true
  return false
}

function validate(raw: string): URL | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null
  if (u.username || u.password) return null
  if (isBlockedHost(u.hostname)) return null
  return u
}

/** Manuel redirect takibi — her hop'ta host yeniden doğrulanır (SSRF). */
async function safeFetch(start: URL, signal: AbortSignal): Promise<Response | null> {
  let url = start
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const res = await fetch(url.toString(), {
      redirect: "manual",
      signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; SentroyOGBot/1.0; +https://tools.sentroy.com)",
        accept: "text/html,application/xhtml+xml",
      },
    })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location")
      if (!loc) return res
      const next = validate(new URL(loc, url).toString())
      if (!next) return null
      url = next
      continue
    }
    return res
  }
  return null
}

function attr(tag: string, name: string): string | null {
  const re = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i")
  const m = tag.match(re)
  return m ? (m[2] ?? m[3] ?? "").trim() : null
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
}

export async function GET(request: NextRequest) {
  const raw = new URL(request.url).searchParams.get("url")
  if (!raw) return NextResponse.json({ error: "url required" }, { status: 400 })
  const target = validate(raw)
  if (!target) return NextResponse.json({ error: "invalid_or_blocked_url" }, { status: 400 })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await safeFetch(target, controller.signal)
    if (!res || !res.ok) return NextResponse.json({ error: "fetch_failed", status: res?.status ?? 0 }, { status: 502 })
    const ctype = res.headers.get("content-type") || ""
    if (!ctype.includes("html")) return NextResponse.json({ error: "not_html" }, { status: 415 })

    // Boyut sınırlı okuma
    const reader = res.body?.getReader()
    let html = ""
    if (reader) {
      const dec = new TextDecoder()
      let total = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.byteLength
        html += dec.decode(value, { stream: true })
        if (total >= MAX_BYTES) {
          void reader.cancel()
          break
        }
      }
    } else {
      html = (await res.text()).slice(0, MAX_BYTES)
    }

    const meta: Record<string, string> = {}
    for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
      const key = attr(tag, "property") || attr(tag, "name")
      const content = attr(tag, "content")
      if (key && content) meta[key.toLowerCase()] = decode(content)
    }
    const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)
    const iconTag = (html.match(/<link\b[^>]*rel\s*=\s*("[^"]*icon[^"]*"|'[^']*icon[^']*')[^>]*>/i) ?? [])[0]
    const favicon = iconTag ? attr(iconTag, "href") : null

    const pick = (...keys: string[]) => keys.map((k) => meta[k]).find(Boolean) ?? null
    const resolveUrl = (u: string | null) => {
      if (!u) return null
      try {
        return new URL(u, target).toString()
      } catch {
        return u
      }
    }

    return NextResponse.json(
      {
        url: target.toString(),
        domain: target.hostname,
        title: pick("og:title", "twitter:title") ?? (titleTag ? decode(titleTag[1]!.trim()) : null),
        description: pick("og:description", "twitter:description", "description"),
        image: resolveUrl(pick("og:image", "og:image:url", "twitter:image")),
        siteName: pick("og:site_name"),
        type: pick("og:type"),
        twitterCard: pick("twitter:card"),
        favicon: resolveUrl(favicon),
        raw: meta,
      },
      { headers: { "cache-control": "public, max-age=300" } },
    )
  } catch {
    return NextResponse.json({ error: "fetch_failed" }, { status: 502 })
  } finally {
    clearTimeout(timer)
  }
}
