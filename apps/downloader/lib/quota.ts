/**
 * Günlük indirme kotası — IP başına 24 saatte 5 başarılı indirme.
 * download route (consume) ve quota route (peek) bunu paylaşır.
 *
 * Not: rate-limit store process-local in-memory (tek container). Günlük pencere
 * + tek instance bu kullanım için yeterli; container restart sayacı sıfırlar.
 */
export const DOWNLOAD_QUOTA = {
  key: "dl:download",
  window: 60 * 60 * 24, // 1 gün (saniye)
  max: 5,
} as const
