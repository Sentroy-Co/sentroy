/**
 * Meet hatırlatma tick'i — status-worker zaten periyodik çalışıyor; her ~2 dk'da
 * bir core'un `/api/meet/reminders` sweep'ini internal-secret ile tetikler.
 * Core, başlangıcına ≤15 dk kalan toplantıların katılımcılarına hatırlatma
 * maili gönderir (idempotent). Worker mail göndermez — yalnız tetikler.
 */

const CORE_BASE = (
  process.env.CORE_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_CORE_APP_URL ||
  "https://sentroy.com"
).replace(/\/$/, "")
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || ""

const CHECK_INTERVAL_MS = 2 * 60 * 1000 // her 2 dakikada
let lastCheckAt = 0

export async function checkMeetReminders(now: number): Promise<{ processed: number }> {
  if (now - lastCheckAt < CHECK_INTERVAL_MS) return { processed: 0 }
  lastCheckAt = now
  if (!INTERNAL_SECRET) {
    console.warn("[meet] INTERNAL_API_SECRET not set — skipping reminder sweep")
    return { processed: 0 }
  }
  try {
    const res = await fetch(`${CORE_BASE}/api/meet/reminders`, {
      method: "POST",
      headers: { "x-internal-secret": INTERNAL_SECRET },
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) {
      console.warn(`[meet] reminder sweep HTTP ${res.status}`)
      return { processed: 0 }
    }
    const json = (await res.json().catch(() => ({}))) as { data?: { processed?: number } }
    return { processed: json.data?.processed ?? 0 }
  } catch (err) {
    console.warn("[meet] reminder sweep failed:", err instanceof Error ? err.message : err)
    return { processed: 0 }
  }
}
