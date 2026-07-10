/**
 * tools.sentroy.com ücretli araç hakkı (kredi). Kullanıcı Polar'da tek-seferlik
 * bir ürün satın aldığında webhook bir entitlement yaratır: `total` kredi
 * (örn 1000 izlenme / 10 dosya indirme), `remaining` tüketildikçe azalır,
 * `expiresAt` (createdAt + validityDays, varsayılan 45 gün) sonrası geçersiz.
 * 45 gün sonra kullanılmayan haklar `deleteExpired` ile silinir.
 */
export interface UserToolEntitlement {
  id: string
  userId: string
  /** Hangi araç — tool registry id'si (örn "ig-views"). */
  toolKey: string
  /** Satın alınan paket anahtarı (örn "ig-views-1k"). */
  packKey: string
  /** Polar order id — idempotency + iz sürme (webhook tekrarında çift yaratma). */
  polarOrderId: string
  polarProductId: string | null
  /** Satın alınan toplam kredi. */
  total: number
  /** Kalan tüketilebilir kredi. */
  remaining: number
  priceUsd: number
  createdAt: Date
  /** createdAt + validityDays (45). Bu tarihten sonra kullanılamaz. */
  expiresAt: Date
}
