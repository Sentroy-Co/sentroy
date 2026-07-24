// types/storage-access.ts — Storage öğesi (dosya/klasör) ŞİRKET-İÇİ erişim kapsamı.
//
// Bu, mevcut `isPublic` (anonim CDN paylaşım linki) ekseninden AYRIDIR — bir
// dosya hem public link'e sahip olabilir hem de listede yalnız yöneticilere
// görünebilir. Notlardaki NoteVisibility ile aynı fikir (author/admins/members)
// ama storage terimleriyle:
//   - "everyone" → şirketin tüm aktif üyeleri (varsayılan; mevcut davranış)
//   - "admins"   → şirket sahibi/yöneticisi + sistem admini (+ öğenin sahibi)
//   - "owner"    → YALNIZCA öğeyi yükleyen/oluşturan (yöneticiler bile göremez)
//
// Sahiplik alanı öğeye göre değişir: media → `uploadedBy`, folder → `ownerUserId`.

export type StorageAccess = "everyone" | "admins" | "owner"

export const STORAGE_ACCESS_VALUES: StorageAccess[] = [
  "everyone",
  "admins",
  "owner",
]

/** Geçersiz/eksik değeri güvenli varsayılana (`everyone`) indirger. */
export function normalizeStorageAccess(value: unknown): StorageAccess {
  return STORAGE_ACCESS_VALUES.includes(value as StorageAccess)
    ? (value as StorageAccess)
    : "everyone"
}
