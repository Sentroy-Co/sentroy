export type CompanyMemberRole = "owner" | "admin" | "member"

/**
 * Permission katalogu.
 *
 * Domains yetkileri parcalanmis halde — bir kullanici yalnizca listeleme,
 * yalnizca edit, yalnizca create vb. yetkilendirilebilir. `domains.manage`
 * legacy meta-izindir; tum alt yetkileri kapsar (geri uyumluluk).
 *
 * `domains.domain:<id>` kapsamli yetki: tek bir domain icin tam erisim
 * (view + edit + verify + DNS goruntuleme) verir, ancak yeni domain yaratma
 * veya silme haklarini icermez.
 */
export type Permission =
  | "domains.view"
  | "domains.create"
  | "domains.edit"
  | "domains.delete"
  | "domains.manage"
  | "mailboxes.manage"
  | "templates.manage"
  | "inbox.view"
  | "audience.manage"
  | "send.execute"
  | "logs.view"
  | "webhooks.manage"
  | "suppressions.manage"
  | "api-keys.manage"
  | "smtp.manage"
  | "members.manage"
  | "storage.view"
  | "buckets.create"
  | "buckets.edit"
  | "buckets.delete"
  | "media.upload"
  | "media.delete"
  | "media.reorder"
  | "auth-projects.manage"
  | "status-page.manage"
  | "studio.manage"
  // WhatsApp Santral — view: sohbet/mesaj okuma, send: mesaj gönderme,
  // manage: oturum bağla/QR/logout (numara yönetimi).
  | "whatsapp.view"
  | "whatsapp.send"
  | "whatsapp.manage"
  // Linear Lite — view: panel/istek/metrik okuma, edit: issue oluştur/düzenle/
  // yorum/ek yükleme, manage: Linear workspace bağlantı ayarları (API key, webhook).
  | "linear.view"
  | "linear.edit"
  | "linear.manage"
  // App Store — company'nin yayınladığı uygulamaları gönder/düzenle/geri çek.
  | "app-store.manage"
  // MongoDB Backuper — bağlantı yönetimi + yedek/geri yükleme/indirme.
  | "mongo.manage"
  | `inbox.mailbox:${string}`
  | `domains.domain:${string}`

export interface CompanyMember {
  id: string
  companyId: string
  userId: string
  role: CompanyMemberRole
  status: "active" | "suspended"
  permissions: Permission[]
  joinedAt: Date
  updatedAt: Date
}
