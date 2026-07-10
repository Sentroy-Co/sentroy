/**
 * Sistem (ilk-parti) uygulamalarında kullanılmak üzere SABİT-tutarlı tek-seferlik
 * ürünler. Tutar kataloğu burada (kod); her tutarın Polar productId eşlemesi
 * admin'den (system_settings) girilir — tools.sentroy.com tool-packs ile aynı
 * patern. Alt uygulamalar `/api/billing/system-checkout` ile istedikleri tutarda
 * satın alma başlatır; metadata.app/reference ile satın alımı kendi tarafında
 * eşler (system_purchases + `/api/billing/system-purchases` sorgusu).
 */
export const SYSTEM_PRODUCT_AMOUNTS = [5, 10, 20, 50, 100] as const

export type SystemProductAmount = (typeof SYSTEM_PRODUCT_AMOUNTS)[number]

/** Tutar → product map anahtarı (string). */
export function amountKey(amount: number): string {
  return String(amount)
}

export function isSystemProductAmount(n: number): n is SystemProductAmount {
  return (SYSTEM_PRODUCT_AMOUNTS as readonly number[]).includes(n)
}
