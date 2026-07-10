/**
 * Sentroy OS masaüstü tercihleri — PER-USER, PER-COMPANY. Duvar kâğıdı, dock
 * sırası + pin/hidden setleri ve masaüstü widget yerleşimleri cihazlar-arası
 * senkron için sunucuda saklanır (eskiden yalnız localStorage'daydı).
 *
 * Tek doküman `{companyId, userId}` başına: kullanıcı her şirkette kendi OS
 * görünümünü taşır. Alanlar OPSIYONEL — istemci yalnız değişen alanı PUT eder
 * (partial patch); eksik alan "kullanıcı henüz özelleştirmedi" demektir ve
 * istemci varsayılanı/seed'i uygular.
 */

/**
 * Masaüstündeki tek widget örneği — apps/core widget registry'sindeki
 * `DesktopWidgetInstance` ile yapısal olarak uyumlu (db paketi apps'ten import
 * edemez; `type` burada geniş `string`, istemci union'a daraltıp doğrular).
 */
export interface OsDesktopWidgetInstance {
  id: string
  type: string
  x: number
  y: number
  config?: Record<string, unknown>
}

export interface OsPreferences {
  id: string
  companyId: string
  userId: string
  /** Seçili duvar kâğıdı id'si (wallpapers katalog anahtarı). */
  wallpaper?: string
  /** Dock ikon sırası — app id listesi. */
  dockOrder?: string[]
  /** Dock'a sabitlenen araç/platform id'leri. */
  dockPinned?: string[]
  /** Dock'tan gizlenen ürün/sistem app id'leri. */
  dockHidden?: string[]
  /** Masaüstü widget örnekleri (konum + config). */
  widgets?: OsDesktopWidgetInstance[]
  updatedAt: Date
}
