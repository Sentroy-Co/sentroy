/**
 * downloader-worker (yt-dlp servisi) ile server-to-server iletişim.
 * Worker internal-only (public domain yok); app x-internal-secret ile konuşur.
 */
const WORKER_URL = (
  process.env.DOWNLOADER_WORKER_URL || "http://localhost:4300"
).replace(/\/+$/, "")

export function workerUrl(path: string): string {
  return `${WORKER_URL}${path}`
}

export function workerHeaders(): Record<string, string> {
  const secret = process.env.DOWNLOADER_API_SECRET
  const h: Record<string, string> = { "Content-Type": "application/json" }
  if (secret) h["x-internal-secret"] = secret
  return h
}

/**
 * Cloudflare Turnstile token doğrulama. TURNSTILE_SECRET set DEĞİLSE doğrulama
 * atlanır (dev/feature-flag-off) → true döner.
 */
export async function verifyTurnstile(
  token: string | null | undefined,
  ip?: string,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET
  if (!secret) return true // Turnstile yapılandırılmamış → bypass
  if (!token) return false
  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret,
          response: token,
          ...(ip ? { remoteip: ip } : {}),
        }),
      },
    )
    const data = (await res.json()) as { success?: boolean }
    return !!data.success
  } catch {
    return false
  }
}
