import createMiddleware from "next-intl/middleware"
import { NextResponse, type NextRequest } from "next/server"
import { routing } from "./i18n/routing"

/**
 * Next.js 16 proxy (middleware).
 *
 * 1) "URL'ye sentroy ekle" kısayolu (Instagram): kullanıcı bir IG içerik
 *    URL'sinde host'u `instagram.sentroy.com` yapınca, içerik path'ini watch
 *    sayfasına rewrite ederiz. Desteklenen formlar:
 *      /reel|/p|/tv|/reels/<id>, /<kullanıcı>/reel|p|tv/<id>, /stories/<user>[/<id>]
 *    Opsiyonel baştaki locale (`/tr/...`) ve `www.` ön eki yok sayılır.
 *    (YouTube'da `/watch?v=` zaten doğal olarak watch route'una düşer.)
 * 2) Geri kalan: next-intl locale yönlendirmesi (10 dil, as-needed prefix).
 */
const intl = createMiddleware(routing)
const LOCALE_SET = new Set(routing.locales as readonly string[])

const IG_DIRECT = /^\/(p|reel|reels|tv)\/[^/]+/i
const IG_USER = /^\/[^/]+\/(reel|reels|p|tv)\/[^/]+/i
const IG_STORY = /^\/stories\/[^/]+/i

export default function proxy(req: NextRequest) {
  let host = (req.headers.get("host") || "").toLowerCase().split(":")[0] || ""
  if (host.startsWith("www.")) host = host.slice(4)

  if (host.startsWith("instagram.")) {
    let p = req.nextUrl.pathname
    // Baştaki locale segmentini (örn. /tr) at — IG URL'sinde olmamalı.
    const segs = p.split("/").filter(Boolean)
    if (segs.length > 0 && LOCALE_SET.has(segs[0]!.toLowerCase())) {
      p = "/" + segs.slice(1).join("/")
    }
    if (IG_DIRECT.test(p) || IG_USER.test(p) || IG_STORY.test(p)) {
      const igUrl = `https://www.instagram.com${p}${req.nextUrl.search}`
      const url = req.nextUrl.clone()
      url.pathname = `/${routing.defaultLocale}/watch`
      url.search = `?url=${encodeURIComponent(igUrl)}`
      return NextResponse.rewrite(url)
    }
  }
  return intl(req)
}

export const config = {
  // API, statik dosyalar, /_next, dosya uzantılıları hariç her şey.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
}
