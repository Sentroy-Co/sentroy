/**
 * Gelen-yön kötüye kullanım koruması — operatör başına submit throttle
 * (triage ratelimit.server.ts portu). Triage DB sayımı kullanıyordu
 * (çok-replica); Linear Lite poller'ı TEK replica olduğundan in-memory
 * sliding-window yeterli (mimari karar). Sayaç yalnız BAŞARILI talep
 * oluşturma anında artar (kaynak semantiği: telegram_request created_at).
 */

// Makul varsayılanlar (triage ile aynı; ileride config'lenebilir).
const PER_MINUTE = 5
const PER_HOUR = 30

// key = `${companyId}:${tgUserId}` → submit timestamp'leri (ms).
const buckets = new Map<string, number[]>()

function key(companyId: string, tgUserId: string | number): string {
  return `${companyId}:${tgUserId}`
}

/** Başarılı talep oluşturma anında çağrılır (createTelegramIssue içinden). */
export function recordSubmit(
  companyId: string,
  tgUserId: string | number,
): void {
  const k = key(companyId, tgUserId)
  const list = buckets.get(k) ?? []
  list.push(Date.now())
  buckets.set(k, list)
}

/**
 * Operatörün son pencerede çok fazla talep açıp açmadığını kontrol eder.
 * allowed=false ise dispatcher flow'a sokmaz; retryAfterSec ile bilgilendirir.
 */
export function checkSubmitRate(
  companyId: string,
  tgUserId: string | number,
): { allowed: boolean; retryAfterSec?: number } {
  const k = key(companyId, tgUserId)
  const now = Date.now()
  const hourAgo = now - 3_600_000
  // Saatlik pencere dışını buda (bellek büyümesin).
  const list = (buckets.get(k) ?? []).filter((t) => t >= hourAgo)
  if (list.length === 0) {
    buckets.delete(k)
    return { allowed: true }
  }
  buckets.set(k, list)

  const minAgo = now - 60_000
  const inMinute = list.filter((t) => t >= minAgo).length
  if (inMinute >= PER_MINUTE) return { allowed: false, retryAfterSec: 60 }
  if (list.length >= PER_HOUR) return { allowed: false, retryAfterSec: 3_600 }

  return { allowed: true }
}
