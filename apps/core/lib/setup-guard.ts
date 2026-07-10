import { timingSafeEqual } from "crypto"
import { NextRequest } from "next/server"
import { jsonError } from "@workspace/console/lib/api-helpers"
import {
  checkRateLimit,
  rateLimitResponse,
} from "@workspace/console/lib/rate-limit"
import { isDbInitialized } from "@/lib/seed-runner"

/**
 * Setup endpoint guard — `/api/setup/{seed,import}` ortak koruması.
 *
 * Bu iki endpoint auth'suzdur (ilk kurulumda henüz kullanıcı yok). Tehdit:
 * taze deploy public erişilebilir olursa, operatör seed atmadan ÖNCE saldırgan
 * kendi admin hesabını POST'layıp platformu ele geçirebilir — `isDbInitialized`
 * "ilk yazan kazanır" olduğu için bunu engellemez.
 *
 * Katmanlar:
 *  1. DB zaten kurulmuşsa 403 (setup kilitli).
 *  2. IP başına rate-limit (probe/brute-force yavaşlatma).
 *  3. Opsiyonel `SETUP_TOKEN` env — set ise `x-setup-token` header'ı timing-safe
 *     eşleşmeli. Set DEĞİLSE geriye dönük uyumlu (eski davranış). Prod'da
 *     set edilmesi şiddetle önerilir → admin-takeover yarışını kapatır.
 */

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

/**
 * Setup'a izin verilip verilmediğini denetler. İzin varsa `null`, aksi halde
 * uygun hata `Response`'u döner. Route'lar: `const blocked = await
 * assertSetupAllowed(req); if (blocked) return blocked`.
 */
export async function assertSetupAllowed(
  request: NextRequest,
): Promise<Response | null> {
  // 2. Rate-limit — auth'suz endpoint, abuse'a açık.
  const rl = checkRateLimit(request, {
    key: "setup",
    window: 600,
    max: 10,
  })
  if (!rl.allowed) return rateLimitResponse(rl)

  // 3. Opsiyonel setup token gate.
  const expected = (process.env.SETUP_TOKEN ?? "").trim()
  if (expected) {
    const provided = (request.headers.get("x-setup-token") ?? "").trim()
    if (!provided || !safeEqual(provided, expected)) {
      return jsonError("Invalid or missing setup token.", 403)
    }
  }

  // 1. DB zaten kurulu mu? (token doğruysa bile tekrar seed'lenemez.)
  const status = await isDbInitialized()
  if (status.initialized) {
    return jsonError("Database is already initialized. Setup is locked.", 403)
  }

  return null
}
