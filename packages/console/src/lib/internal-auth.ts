import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"

/** Sabit-zamanlı string eşitliği — timing attack'e kapalı. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

/**
 * Server-to-server çağrılar için shared secret doğrulaması.
 *
 * Core app, bir company silinirken mail.sentroy.com üzerindeki cleanup
 * endpoint'ine kullanıcı cookie'si olmadan POST atar — cookie cross-domain
 * server-to-server fetch'te forward edilmez. Bunun yerine her app aynı
 * `INTERNAL_API_SECRET` env'ine sahip olur; çağıran secret'ı
 * `x-internal-secret` header'ında gönderir, alıcı bu fonksiyonla doğrular.
 *
 * Bu secret **hiçbir zaman** istemci tarafına sızmamalı. Sadece `NEXT_PUBLIC_*`
 * prefix'i olmayan bir env var'da tutulur ve sadece Node çalışma zamanında
 * okunur.
 */
export function verifyInternalRequest(request: NextRequest): NextResponse | null {
  const expected = process.env.INTERNAL_API_SECRET
  if (!expected) {
    // Env konfigüre edilmemişse güvenli taraf: her zaman reddet. Boş
    // secret'la eşleşme kabul etmiyoruz (bypass engellenir).
    return NextResponse.json(
      { error: "INTERNAL_API_SECRET not configured on this server" },
      { status: 500 },
    )
  }
  const provided = request.headers.get("x-internal-secret")
  if (!provided || !safeEqual(provided, expected)) {
    // NOT: provided değeri response'a ASLA echo'lanmaz (eski debug alanı
    // kaldırıldı) — sabit-zamanlı karşılaştırma timing leak'i de kapatır.
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return null
}

/**
 * Header secret'ı sabit-zamanlı doğrula, reject ETMEDEN boolean döner —
 * "internal-secret VEYA session" fallback eden endpoint'ler (ör. provision)
 * için. `verifyInternalRequest` hard-reject ederken bu sadece eşleşmeyi söyler.
 */
export function isValidInternalSecret(
  provided: string | null | undefined,
): boolean {
  const expected = process.env.INTERNAL_API_SECRET
  if (!expected || !provided) return false
  return safeEqual(provided, expected)
}

/**
 * Başka bir app'in `/api/...` endpoint'ini server-to-server çağırmak için
 * header setini üretir. Çağıran zaten bir `fetch()` çağrısı yapıyor; biz
 * yalnızca header'ları ekliyoruz.
 */
export function internalAuthHeaders(): Record<string, string> {
  const secret = process.env.INTERNAL_API_SECRET
  if (!secret) {
    throw new Error("INTERNAL_API_SECRET is not configured")
  }
  return { "x-internal-secret": secret }
}
