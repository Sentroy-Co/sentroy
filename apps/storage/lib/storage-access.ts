// lib/storage-access.ts — şirket-içi erişim tier'ı yardımcıları (dosya/klasör).
//
// Notlardaki `apps/core/lib/notes/shared.ts` muadili. Erişim ekseni mevcut
// `isPublic` (anonim CDN) ekseninden AYRIDIR — bkz. packages/db types/storage-access.

import type { StorageAccess, Permission } from "@workspace/db/types"
import { STORAGE_ACCESS_VALUES } from "@workspace/db/types"
import { hasPermission } from "@workspace/auth/server/permissions"

/** Whitelist doğrulaması — geçersiz değeri `everyone`'a indirger. */
export function parseStorageAccess(value: unknown): StorageAccess {
  return STORAGE_ACCESS_VALUES.includes(value as StorageAccess)
    ? (value as StorageAccess)
    : "everyone"
}

/** resolveCompanyAccess sonucundan minimal alanlar (session-only doğrulanır). */
interface AccessLike {
  member: { role?: string } | null
  session?: { user?: { role?: string } } | null
  callerUserId: string
}

/**
 * "admins" tier'ının kapsamı: şirket sahibi/yöneticisi + sistem admini.
 * (Token erişiminde `member` null → false; token'lar admin sayılmaz.)
 */
export function viewerIsCompanyAdmin(access: AccessLike): boolean {
  return (
    access.member?.role === "owner" ||
    access.member?.role === "admin" ||
    access.session?.user?.role === "admin"
  )
}

/** findByBucket / aggregateFolders'a geçen izleyici. */
export function storageViewer(access: AccessLike): {
  userId: string
  isAdmin: boolean
} {
  return {
    userId: access.callerUserId,
    isAdmin: viewerIsCompanyAdmin(access),
  }
}

/**
 * Bir öğenin (verilen sahibi ile) `access` tier'ında izleyiciye görünür olup
 * olmadığı — tekil read/serve gate'i için ($or filtresinin JS eşiti).
 */
export function canViewItem(
  itemAccess: StorageAccess | null | undefined,
  ownerUserId: string | null | undefined,
  access: AccessLike,
  sharedWith?: string[] | null,
): boolean {
  const tier = itemAccess ?? "everyone"
  if (tier === "everyone") return true
  if (ownerUserId && ownerUserId === access.callerUserId) return true
  // Kişi-bazlı paylaşım grant'i — tier kilitlese bile alıcı görür.
  if (sharedWith && sharedWith.includes(access.callerUserId)) return true
  if (tier === "admins") return viewerIsCompanyAdmin(access)
  return false // "owner" → yalnız sahip / grant'li (yukarıda döndü)
}

/**
 * Bir öğenin erişim tier'ını DEĞİŞTİRME yetkisi — öğenin sahibi VEYA şirket
 * sahibi/yöneticisi (notlardaki PATCH gate'iyle aynı: author OR owner/admin).
 */
export function canManageItemAccess(
  ownerUserId: string | null | undefined,
  access: AccessLike,
): boolean {
  if (ownerUserId && ownerUserId === access.callerUserId) return true
  return viewerIsCompanyAdmin(access)
}

/**
 * Çağıranın verilen storage permission'ına sahip olup olmadığı. Token erişimi
 * daima tam yetkili (şirket-kapsamlı); session için permission engine'e sorar
 * (system-admin + owner/admin + granular permission dizisini kapsar).
 */
export async function callerHasPermission(
  access: {
    isTokenAccess: boolean
    session: Parameters<typeof hasPermission>[0] | null
  },
  slug: string,
  permission: Permission,
): Promise<boolean> {
  if (access.isTokenAccess) return true
  if (!access.session) return false
  return hasPermission(access.session, slug, permission)
}
