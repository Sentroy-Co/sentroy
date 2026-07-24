import type { StorageAccess } from "./storage-access"

export interface BucketFolder {
  id: string
  companyId: string
  bucketId: string
  path: string
  /**
   * Klasörü oluşturan kullanıcının auth user id'si — "owner" (sadece ben)
   * erişim tier'ının sahiplik kontrolü için. Legacy doc'larda boş olabilir.
   */
  ownerUserId?: string
  /**
   * Şirket-içi erişim kapsamı (bkz. types/storage-access.ts). Klasör private
   * yapıldığında içindeki media'lara cascade edilir (mediaModel.setFolderAccess).
   * Legacy/derived (yalnız media prefix'inden türeyen) klasörler → `everyone`.
   */
  access?: StorageAccess
  createdAt: Date
  updatedAt: Date
}
