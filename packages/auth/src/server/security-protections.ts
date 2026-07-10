/**
 * Auth-katmanı için sunucu-tarafı koruma helper'ları:
 *  • Honeypot — client tarafındaki gizli alanın server-side doğrulaması
 *    (defense in depth; bot doğrudan API'yi vurursa client'i bypass ediyor
 *    ama server hâlâ kapıda durur).
 *  • Cloudflare Turnstile — env ile aktive olan, görünmez/görünür CAPTCHA.
 *    Token doğrulama Cloudflare'in `siteverify` endpoint'ine fetch ile
 *    yapılır; secret önce vault'tan, yoksa `process.env`'den okunur.
 *    Set edilmediği ortamlarda no-op (geri uyumluluk: dev'de CAPTCHA kapalı).
 */

import { getEnvWithFallback } from "@sentroy-co/client-sdk/vault"

const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify"

const HONEYPOT_FIELD_NAME = "website"

/**
 * Server-side honeypot kontrolü. Client form'undan POST edilen request
 * body'sinde `website` alanı dolu ise bot. Better-auth hook'larında
 * `ctx.body` parsed JSON olarak gelir; bu helper'ı doğrudan onunla
 * çağırabiliriz. Body record-tipinde olmasa bile narrow with `in` check.
 */
export function isHoneypotFilledOnServer(
  body: unknown,
  field: string = HONEYPOT_FIELD_NAME,
): boolean {
  if (!body || typeof body !== "object") return false
  if (!(field in body)) return false
  const v = (body as Record<string, unknown>)[field]
  if (typeof v !== "string") return false
  return v.trim().length > 0
}

/**
 * Cloudflare Turnstile token doğrulama. `BETTER_AUTH_TURNSTILE_SECRET`
 * set edilmediği ortamlarda her token (boş bile) `{ ok: true }` döner —
 * yerel dev'de Turnstile'siz çalışılabilsin.
 *
 * Production'da:
 *   1. `NEXT_PUBLIC_TURNSTILE_SITE_KEY` client formuna inject edilir
 *      (form Turnstile widget'ı render edip token'ı `cfTurnstileToken`
 *      field'ına yazar).
 *   2. `BETTER_AUTH_TURNSTILE_SECRET` server tarafında bu fonksiyon
 *      tarafından kullanılır.
 *
 * Dönüş: `ok: true` geçti, `false` geçemedi (`reason` debug için).
 */
export async function verifyTurnstileToken(
  token: string | null | undefined,
  remoteIp?: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  // Geçici devre dışı bırakma — `TURNSTILE_DISABLED=1` ya da `=true` set
  // edilirse server-side check tamamen atlanır. Secret silmek yerine
  // bu flag tercih edilir; widget bağlama, build, env'ler hep yerinde
  // kalır, kullanıcı flag'i kaldırınca check geri açılır.
  if (
    process.env.TURNSTILE_DISABLED === "1" ||
    process.env.TURNSTILE_DISABLED === "true"
  ) {
    return { ok: true }
  }
  const secret = await getEnvWithFallback("BETTER_AUTH_TURNSTILE_SECRET")
  if (!secret) return { ok: true } // CAPTCHA disabled in this env

  if (!token || typeof token !== "string" || token.length < 10) {
    // En yaygın yanlış konfigürasyon: server tarafında secret set
    // edilmiş ama client `NEXT_PUBLIC_TURNSTILE_SITE_KEY` build-time'da
    // bundle'a girmediği için widget render olmamış. Bu durumda hiç
    // token gelmez. Log'a yaz ki user tanıyabilsin.
    console.warn(
      "[turnstile] siteverify skipped — token missing/short. " +
        "Check that NEXT_PUBLIC_TURNSTILE_SITE_KEY was set as a build " +
        "arg (GitHub Actions secret) and the image was rebuilt after.",
    )
    return { ok: false, reason: "missing_token" }
  }

  try {
    const formData = new URLSearchParams()
    formData.set("secret", secret)
    formData.set("response", token)
    if (remoteIp && remoteIp !== "unknown") formData.set("remoteip", remoteIp)

    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      body: formData,
      // Cloudflare verify yavaşlığı login'i kilitlemesin — 5 sn timeout.
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) {
      return { ok: false, reason: `siteverify_${res.status}` }
    }
    const json = (await res.json()) as {
      success: boolean
      "error-codes"?: string[]
    }
    if (!json.success) {
      const reason = (json["error-codes"] ?? ["unknown"]).join(",")
      // siteverify-failed sebepleri (Cloudflare docs):
      //   invalid-input-secret  → secret yanlış / Cloudflare'de görünmez
      //   invalid-input-response → token geçersiz / süresi dolmuş
      //   timeout-or-duplicate  → token tek-kullanım, tekrar denenmiş
      //   missing-input-response → boş token
      // Hangisi olursa olsun log'a yaz; user bunu Coolify console'unda görür.
      console.warn(
        `[turnstile] siteverify rejected: ${reason}. ` +
          "Common causes: secret mismatch, expired/reused token, or " +
          "site key bound to a different hostname.",
      )
      return { ok: false, reason }
    }
    return { ok: true }
  } catch (err) {
    // Network / timeout — fail-closed: production'da CAPTCHA active iken
    // Cloudflare'e ulaşamazsak login'i geçirmemek daha güvenli.
    console.warn(
      "[turnstile] verify failed:",
      err instanceof Error ? err.message : err,
    )
    return { ok: false, reason: "network_error" }
  }
}
