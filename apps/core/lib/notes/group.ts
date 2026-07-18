/**
 * Not tarih gruplama — SAF fonksiyonlar (db yok). Sunucu (GET /notes), web
 * (client) ve mobil AYNI sınırları paylaşır (tek kaynak). Bölüm başlıkları
 * `group` anahtarından türetilir; etiketler istemcide lokalize edilir.
 *
 * Anahtar formatı (locale-bağımsız):  `last7` | `last30` | `m:YYYY-MM` | `y:YYYY`
 */

/** [now] request/render zamanı. */
export function noteGroupKey(updatedAt: Date, now: Date): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const that = new Date(
    updatedAt.getFullYear(),
    updatedAt.getMonth(),
    updatedAt.getDate(),
  )
  const days = Math.floor((today.getTime() - that.getTime()) / 86_400_000)
  if (days < 7) return "last7"
  if (days < 30) return "last30"
  if (updatedAt.getFullYear() === now.getFullYear()) {
    return `m:${updatedAt.getFullYear()}-${String(updatedAt.getMonth() + 1).padStart(2, "0")}`
  }
  return `y:${updatedAt.getFullYear()}`
}

/** `m:YYYY-MM` → lokalize ay adı (Intl). Diğer anahtarlar için boş döner. */
export function noteGroupMonthLabel(key: string, locale: string): string {
  const m = key.match(/^m:(\d{4})-(\d{2})$/)
  if (!m) return ""
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1)
  const label = new Intl.DateTimeFormat(locale, { month: "long" }).format(d)
  return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1)
}
