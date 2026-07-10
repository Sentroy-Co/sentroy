/**
 * tools.sentroy.com ücretli paket kataloğu (kod-tanımlı ürün yapısı).
 *
 * Operatör Polar'da genellenmiş tek-seferlik ürünler yaratır ($5/$10/$20/$50/
 * $100). Her paket bir `priceUsd` taşır; checkout sırasında `packKey` →
 * Polar productId eşlemesi DB'den (toolPackProductModel) okunur — yani operatör
 * yarattığı ürünün id'sini ilgili pakete bağlar. Birden çok paket aynı fiyat
 * ürününü paylaşabilir. `credits` satın alınınca verilen kontör (1000 izlenme,
 * 10 indirme…), `validityDays` (45) sonra kullanılmayan hak silinir.
 *
 * Bu katalog hem core (checkout + webhook → entitlement) hem downloader
 * (araç sayfasında fiyat listesi) tarafından tüketilir.
 */
export const ENTITLEMENT_VALIDITY_DAYS = 45

export interface ToolPack {
  key: string
  /** tool registry id'si (örn "pdf-merge"). */
  toolKey: string
  /** Satın alınınca verilen kontör. */
  credits: number
  /** Görüntülenecek birim ("views", "likes", "downloads"). */
  unit: string
  priceUsd: number
  validityDays: number
  name: { en: string; tr: string }
}

// Henüz meşru ücretli paket yok. Yeni ücretli tool eklerken buraya pack ekle
// (toolKey registry id'siyle eşleşmeli) + /api/admin/billing/tool-products ile
// Polar productId'sini bağla. Sahte-etkileşim (izlenme/beğeni satışı) paketleri
// KATEGORİK OLARAK eklenmez — platform ToS ihlali + ödeme sağlayıcı riski.
export const TOOL_PACKS: ToolPack[] = []

export function findPack(key: string): ToolPack | null {
  return TOOL_PACKS.find((p) => p.key === key) ?? null
}

export function packsForTool(toolKey: string): ToolPack[] {
  return TOOL_PACKS.filter((p) => p.toolKey === toolKey)
}
