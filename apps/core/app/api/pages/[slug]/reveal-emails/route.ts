export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { verifyTurnstileToken } from "@workspace/auth/server/security-protections"
import { getDb } from "@workspace/db/client"
import { extractEmails } from "@/lib/protect-emails"

export const runtime = "nodejs"

/**
 * POST /api/pages/:slug/reveal-emails — statik sayfadaki korumalı e-postaları
 * YALNIZ Cloudflare Turnstile doğrulaması geçilince döndürür. Public GET yanıtı
 * ({/api/pages/:slug}) e-postaları çıkarır (placeholder span'ler); gerçek adresler
 * yalnız burada, sunucuda içerikten yeniden çıkarılıp döner (bot scraper koruması).
 *
 * Doğrulama contact/email + login ile AYNI helper (verifyTurnstileToken);
 * TURNSTILE_DISABLED=1 / secret yoksa {ok:true} döner (yerel dev) — o durumda
 * bile adresler yalnız bu POST'tan gelir, HTML'de görünmez.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  let token: string | null = null
  let lang = "en"
  try {
    const body = (await request.json()) as { token?: string; lang?: string }
    token = body?.token ?? null
    if (typeof body?.lang === "string" && body.lang.length <= 8) lang = body.lang
  } catch {
    /* boş gövde */
  }

  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    undefined

  const result = await verifyTurnstileToken(token, ip)
  if (!result.ok) return jsonError("Verification failed", 403)

  const db = await getDb()
  const page = await db.collection("static_pages").findOne({ slug, published: true })
  if (!page) return jsonError("Page not found", 404)

  const emails = extractEmails(page.content as Record<string, string> | string, lang)
  return jsonSuccess({ emails })
}
