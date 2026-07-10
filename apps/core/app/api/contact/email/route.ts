import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { verifyTurnstileToken } from "@workspace/auth/server/security-protections"

export const runtime = "nodejs"

/**
 * POST /api/contact/email — İletişim e-postasını YALNIZ Cloudflare Turnstile
 * doğrulaması geçilince döndürür. E-posta client bundle'ında / HTML'de HİÇ
 * bulunmaz (bot scraper koruması) — yalnız burada, sunucu env'inden döner.
 *
 * Doğrulama, login ile AYNI helper'ı kullanır (verifyTurnstileToken,
 * BETTER_AUTH_TURNSTILE_SECRET). TURNSTILE_DISABLED=1 veya secret yoksa helper
 * {ok:true} döner (yerel dev / captcha kapalı) — o durumda bile e-posta yalnız
 * bu POST'tan döner, HTML'de görünmez.
 */
export async function POST(request: NextRequest) {
  const email = process.env.CONTACT_EMAIL || "info@sentroy.com"

  let token: string | null = null
  try {
    const body = (await request.json()) as { token?: string }
    token = body?.token ?? null
  } catch {
    /* boş gövde → token yok */
  }

  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    undefined

  const result = await verifyTurnstileToken(token, ip)
  if (!result.ok) return jsonError("Verification failed", 403)

  return jsonSuccess({ email })
}
