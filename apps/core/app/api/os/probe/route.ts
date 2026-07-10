import { NextRequest } from "next/server"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/os/probe?url= — OS iframe sağlık sondası.
 *
 * iframe'ler cross-origin HTTP durumunu okuyamaz; alt-app düştüğünde (502/504)
 * kullanıcı çıplak "Bad Gateway" HTML'i görür. OS pencere/section frame'leri
 * yüklemeden önce bu endpoint'le hedefi yoklar; 5xx/erişilemez ise OS-stilinde
 * "Uygulama başlatılamadı" fallback'i gösterir.
 *
 * SSRF koruması: yalnız https + sentroy.com / *.sentroy.com hostname'leri.
 */
export async function GET(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)

  const raw = request.nextUrl.searchParams.get("url")
  if (!raw) return jsonError("url required", 400)

  let target: URL
  try {
    target = new URL(raw)
  } catch {
    return jsonError("invalid url", 400)
  }
  const host = target.hostname
  const allowed =
    target.protocol === "https:" && (host === "sentroy.com" || host.endsWith(".sentroy.com"))
  if (!allowed) return jsonError("host not allowed", 400)

  try {
    const res = await fetch(target.toString(), {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
      // Sadece durum kodu gerekiyor; gövdeyi okumadan bırakıyoruz.
      headers: { accept: "text/html" },
    })
    // 4xx (auth/redirect ucu) app'in AYAKTA olduğunu gösterir — yalnız 5xx "down".
    return jsonSuccess({ ok: res.status < 500, status: res.status })
  } catch {
    return jsonSuccess({ ok: false, status: 0 })
  }
}
