import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Görsel proxy — Instagram/fbcdn thumbnail'leri `Cross-Origin-Resource-Policy:
 * same-origin` döndürdüğü için tarayıcıda hotlink edilemiyor
 * (ERR_BLOCKED_BY_RESPONSE.NotSameOrigin). Bunları kendi origin'imizden
 * yeniden servis eder. SSRF'e karşı yalnız medya-CDN host'larına izin verilir.
 */
const ALLOWED = /(?:^|\.)(fbcdn\.net|cdninstagram\.com|ytimg\.com|ggpht\.com|sndcdn\.com)$/i

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url")
  if (!raw) return NextResponse.json({ error: "Missing url" }, { status: 400 })

  let target: URL
  try {
    target = new URL(raw)
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 })
  }
  if (target.protocol !== "https:" || !ALLOWED.test(target.hostname)) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 400 })
  }

  let upstream: Response
  try {
    upstream = await fetch(target.toString(), {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "image/*" },
      // fbcdn referer kontrolü yok; UA yeterli.
    })
  } catch {
    return NextResponse.json({ error: "Fetch failed" }, { status: 502 })
  }
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Upstream error" }, { status: 502 })
  }
  const ct = upstream.headers.get("content-type") || "image/jpeg"
  if (!ct.startsWith("image/")) {
    return NextResponse.json({ error: "Not an image" }, { status: 415 })
  }
  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "content-type": ct,
      "cache-control": "public, max-age=3600",
    },
  })
}
