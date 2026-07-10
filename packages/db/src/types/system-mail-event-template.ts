/**
 * Admin tarafından düzenlenebilir transactional sistem mail içerikleri.
 *
 * "Event" — auth verification, password reset, magic link, OTP, davet
 * gibi platform tarafından tetiklenen mail kanalları. Her event için
 * code-side bir "default" kayıtlıdır (packages/auth/src/server/system-mail-events.ts);
 * admin /admin/system-mail/events üzerinden subject/htmlBody'yi locale
 * başına override edebilir. Override DB'ye yazılır; reset ile silinir
 * ve default geri devreye girer.
 *
 * `eventKey` — code-side registry ile birebir eşleşen stable id
 * (örn `auth.verify-email`). Unique index burada yaşar.
 */
export type LocalizedString = Record<string, string>

export interface SystemMailEventTemplate {
  id: string
  eventKey: string
  /** Locale → subject. Yoksa default. */
  subject: LocalizedString
  /** Locale → HTML body. Yoksa default. */
  htmlBody: LocalizedString
  /** Per-event toggle. Disabled olan event mail göndermez (sadece sender
   *  tarafında log). Future use; şu an her zaman true. */
  enabled: boolean
  /** Son düzenleyen admin kullanıcı id'si — audit için. */
  updatedBy: string | null
  createdAt: Date
  updatedAt: Date
}
