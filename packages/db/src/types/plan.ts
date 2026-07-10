export type LocalizedString = Record<string, string>

/**
 * WhatsApp Santral plan-limit varsayılanları. Plan/company kaydında alan
 * tanımsızsa (eski kayıtlar) enforcement bu değerleri kullanır. `-1` sınırsız.
 */
export const WHATSAPP_LIMIT_DEFAULTS = {
  maxNumbers: 1,
  maxTemplates: 5,
  monthlySends: 200,
} as const

/**
 * Polar product eşlemesi — bir ortam (sandbox/production) için aylık ve
 * yıllık ürünlerin Polar product ID'leri. Polar'da aylık ve yıllık AYRI
 * ürün olduğu için her interval ayrı ID tutar. Boşsa o interval satın
 * alınamaz (ör. Free plan tüm alanları boş).
 */
export interface PolarProductMap {
  monthlyProductId?: string
  yearlyProductId?: string
}

/**
 * Plan'ın Polar eşlemesi. Sandbox ve production tamamen izole olduğundan
 * her ortam için ayrı product ID'leri. Aktif ortam `PolarSettings.activeMode`
 * ile belirlenir; checkout o ortamın ID'sini kullanır.
 */
export interface PlanPolarMapping {
  sandbox: PolarProductMap
  production: PolarProductMap
}

export interface Plan {
  id: string
  name: LocalizedString
  description: LocalizedString
  maxCompanies: number
  maxDomainsPerCompany: number
  maxMembersPerCompany: number
  maxMailboxesPerCompany: number
  maxContacts: number
  storageLimit: number
  trashRetentionDays: number
  monthlyEmailLimit: number
  /** WhatsApp Santral — bağlanabilecek numara (session) sayısı. Eski plan
   *  kayıtlarında tanımsız olabilir → `WHATSAPP_LIMIT_DEFAULTS` ile tolere edilir. */
  maxWhatsappNumbers?: number
  /** WhatsApp Santral — oluşturulabilecek şablon sayısı. */
  maxWhatsappTemplates?: number
  /** WhatsApp Santral — aylık gönderim limiti (API + toplu). `-1` = sınırsız. */
  monthlyWhatsappLimit?: number
  /** Çok dilli özellik listesi — pricing kartlarında render edilir. Eski
   *  düz `string[]` kayıtlar read-time'da `normalizeLocalized` ile sarılır. */
  features: LocalizedString[]
  /** Aylık fiyat (USD). `price === 0` → ücretsiz/varsayılan plan. */
  price: number
  /** Yıllık fiyat (USD/yıl). Tanımsız ise yıllık seçenek sunulmaz. */
  yearlyPrice?: number
  /** Polar product eşlemesi (her ortam × her interval). Boş ise plan
   *  ödeme gerektirmez (Free) ya da henüz Polar'a bağlanmamış. */
  polar?: PlanPolarMapping
  isDefault: boolean
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}
