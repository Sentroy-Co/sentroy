export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"

export const runtime = "nodejs"

/**
 * GET /api/og?url=  — post içindeki linkler için OG-meta önizlemesi (Twitter
 * stili kart). Giriş zorunlu (açık-proxy suistimalini önler). SSRF koruması:
 * yalnız http(s) + public host; private/loopback/link-local/metadata IP'leri
 * ve internal hostname'ler reddedilir; yönlendirmeler manuel + her adımda
 * yeniden doğrulanır; timeout + gövde boyutu sınırı. Best-effort cache (10 dk).
 */
const CACHE = new Map<string, { at: number; data: OgData }>()
const CACHE_TTL = 10 * 60 * 1000
const MAX_BYTES = 512 * 1024
const TIMEOUT_MS = 6000

interface OgData {
  url: string
  title: string | null
  description: string | null
  image: string | null
  siteName: string | null
}

const PRIVATE_HOST =
  /^(localhost$|.*\.local$|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|\[?::1\]?$|\[?fe80:|\[?fc00:|\[?fd)/i

function isPublicHttpUrl(raw: string): URL | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null
  const host = u.hostname.toLowerCase()
  if (PRIVATE_HOST.test(host)) return null
  // Çıplak IPv4 private blokları (PRIVATE_HOST 10./192.168./169.254. kapsar;
  // 172.16-31. ek kontrol)
  const m = /^(\d+)\.(\d+)\./.exec(host)
  if (m && m[1] === "172") {
    const second = Number(m[2])
    if (second >= 16 && second <= 31) return null
  }
  return u
}

function pickMeta(html: string, keys: string[]): string | null {
  for (const key of keys) {
    // <meta property="og:title" content="..."> (sıra değişebilir)
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`,
      "i",
    )
    const m = re.exec(html)
    if (m?.[1]) return decodeEntities(m[1].trim())
    const re2 = new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${key}["']`,
      "i",
    )
    const m2 = re2.exec(html)
    if (m2?.[1]) return decodeEntities(m2[1].trim())
  }
  return null
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

async function fetchHtml(start: URL): Promise<{ finalUrl: URL; html: string } | null> {
  let current = start
  for (let i = 0; i < 4; i++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(current.toString(), {
        redirect: "manual",
        signal: ctrl.signal,
        headers: { "user-agent": "SentroyBot/1.0 (+https://sentroy.com)", accept: "text/html" },
      })
    } catch {
      clearTimeout(timer)
      return null
    }
    clearTimeout(timer)
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location")
      if (!loc) return null
      const next = isPublicHttpUrl(new URL(loc, current).toString())
      if (!next) return null // redirect internal → reddet (SSRF)
      current = next
      continue
    }
    if (!res.ok) return null
    const ct = res.headers.get("content-type") || ""
    if (!ct.includes("text/html")) return null
    // Gövde boyutunu sınırla
    const reader = res.body?.getReader()
    if (!reader) return null
    const chunks: Uint8Array[] = []
    let total = 0
    while (total < MAX_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        chunks.push(value)
        total += value.length
      }
    }
    await reader.cancel().catch(() => {})
    const html = new TextDecoder().decode(
      chunks.reduce((acc, c) => {
        const out = new Uint8Array(acc.length + c.length)
        out.set(acc)
        out.set(c, acc.length)
        return out
      }, new Uint8Array()),
    )
    return { finalUrl: current, html }
  }
  return null
}

export async function GET(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)

  const raw = request.nextUrl.searchParams.get("url") || ""
  const target = isPublicHttpUrl(raw)
  if (!target) return jsonError("Invalid or blocked URL", 400)

  const key = target.toString()
  const cached = CACHE.get(key)
  if (cached && Date.now() - cached.at < CACHE_TTL) {
    return jsonSuccess(cached.data)
  }

  const fetched = await fetchHtml(target)
  if (!fetched) {
    const empty: OgData = { url: key, title: null, description: null, image: null, siteName: null }
    return jsonSuccess(empty)
  }

  const { html, finalUrl } = fetched
  const titleTag = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? null
  let image = pickMeta(html, ["og:image", "twitter:image", "twitter:image:src"])
  if (image) {
    try {
      image = new URL(image, finalUrl).toString()
    } catch {
      image = null
    }
    // image host'u da public olmalı
    if (image && !isPublicHttpUrl(image)) image = null
  }
  const data: OgData = {
    url: key,
    title: pickMeta(html, ["og:title", "twitter:title"]) ?? titleTag,
    description: pickMeta(html, ["og:description", "twitter:description", "description"]),
    image,
    siteName: pickMeta(html, ["og:site_name"]) ?? finalUrl.hostname,
  }
  CACHE.set(key, { at: Date.now(), data })
  return jsonSuccess(data)
}
