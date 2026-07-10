/**
 * Ödenmiş sistem tek-seferlik ürün satın alımı kaydı. Polar webhook'u
 * (order.paid, metadata.type==="system-product") ile yazılır. Alt uygulamalar
 * `/api/billing/system-purchases?app=&reference=` ile sorgulayıp ne sağladıklarına
 * kendileri karar verir (entitlement mantığı app'e özgü — bu kayıt yalnız ödeme
 * kanıtıdır).
 */
export interface SystemPurchase {
  id: string
  userId: string
  /** Satın almayı başlatan alt uygulama (örn. "mail", "studio") — opsiyonel. */
  app: string | null
  /** App'in satın almayı kendi tarafında eşlemesi için serbest referans. */
  reference: string | null
  /** USD tutar (5/10/20/50/100). */
  amountUsd: number
  /** Polar order id — idempotency anahtarı (unique). */
  polarOrderId: string
  polarProductId: string | null
  createdAt: Date
}
