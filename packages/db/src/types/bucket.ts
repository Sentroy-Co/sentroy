import type { StorageAccess } from "./storage-access"

export interface Bucket {
  id: string
  companyId: string
  name: string
  slug: string
  description?: string
  isPublic: boolean
  storageUsed: number
  fileCount: number
  /**
   * Bucket'ı oluşturan kullanıcının auth user id'si — "owner" (sadece ben)
   * erişim tier'ının sahiplik kontrolü için. Legacy/sistem bucket'larda boş.
   */
  ownerUserId?: string
  /**
   * Şirket-içi erişim kapsamı (bkz. types/storage-access.ts) — `isPublic`
   * (anonim CDN) ekseninden AYRI. "owner" → yalnız oluşturan; "admins" →
   * sahip + şirket yöneticileri; "everyone"/legacy → tüm üyeler. Bucket
   * görünmüyorsa içindeki tüm medya/klasör de erişilemez (slug gate'i).
   */
  access?: StorageAccess
  createdAt: Date
  updatedAt: Date
}
