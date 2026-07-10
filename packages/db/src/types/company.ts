/**
 * Polar abonelik durumu — company-scoped (kullanıcı değil company plan
 * sahibi). Webhook'larla senkron tutulur. `status` Polar'ın subscription
 * status enum'una eşlenir; limit enforcement company.max* alanlarından
 * okunur (denormalize), bu kayıt durum/yenileme/iptal takibi içindir.
 */
export interface CompanySubscription {
  polarSubscriptionId: string
  polarProductId: string
  /** Bu aboneliğin karşılık geldiği Sentroy planı. */
  planId: string
  interval: "month" | "year"
  status:
    | "active"
    | "trialing"
    | "past_due"
    | "canceled"
    | "unpaid"
    | "incomplete"
  /** Mevcut faturalama döneminin bitişi (yenileme / iptal-sonrası erişim sınırı). */
  currentPeriodEnd: Date | null
  /** Dönem sonunda iptal işaretliyse true (erişim dönem sonuna kadar sürer). */
  cancelAtPeriodEnd: boolean
  /** Aboneliğin geldiği Polar ortamı — webhook imzasından belirlenir. */
  environment: "sandbox" | "production"
  updatedAt: Date
}

export interface Company {
  id: string
  name: string
  slug: string
  ownerId: string
  planId: string
  /** Polar customer ID — webhook reverse-lookup ve portal session için. */
  polarCustomerId?: string | null
  /** Aktif Polar aboneliği (varsa). Free/ödemesiz company'lerde null. */
  subscription?: CompanySubscription | null
  mailStorageLimit: number
  mailStorageUsed: number
  maxDomains: number
  maxMembers: number
  maxMailboxes: number
  maxContacts: number
  trashRetentionDays: number
  monthlyEmailLimit: number
  monthlyEmailsSent: number
  /** WhatsApp Santral limitleri (plandan denormalize). Eski kayıtlarda
   *  tanımsız olabilir → enforcement `?? DEFAULT` ile tolere eder. */
  maxWhatsappNumbers?: number
  maxWhatsappTemplates?: number
  monthlyWhatsappLimit?: number
  sentroyApiKey?: string
  /** CDN'deki avatar URL'i — settings'ten yüklenir, sidebar'daki team
   *  switcher ve dashboard kartlarında gösterilir. Eski/yeni file media id
   *  ayrı tutulmuyor: sadece URL; eski dosya silinmesi için endpoint
   *  upload sırasında lookup yapar. */
  avatarUrl?: string | null
  /** Wide cover image shown on the public company profile page
   *  (`/[lang]/profile/c/[company-slug]`). Owner/admin uploads via the
   *  settings → branding section using the MediaManager picker. URL
   *  pointer only, like avatarUrl. */
  coverImageUrl?: string | null
  /** Optional one-line bio displayed on the company profile header. */
  description?: string | null
  createdAt: Date
  updatedAt: Date
}
