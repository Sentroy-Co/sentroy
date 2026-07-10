/**
 * Cross-app sabitler. `apps/core/lib/system-mail.ts` system-mail flow'una özel
 * helper'lar barındırıyor; ama `__system` slug'ı mail/storage app'lerinin de
 * tanıması gereken bir filter sabiti. Burada tek noktada toplandı ki user-
 * facing list'lerde herkes aynı sabite karşı filter yapabilsin.
 */

/** Platform-managed shadow company. User UI'larında hiçbir zaman görünmemeli. */
export const SYSTEM_COMPANY_SLUG = "__system"

/** Platform-managed shared bucket (template thumbnail'ları, system assets). */
export const SYSTEM_BUCKET_SLUG = "system-files"

/** Per-company platform bucket for company avatars/logos. */
export const COMPANY_AVATAR_BUCKET_SLUG = "__avatar"

/** Per-company platform bucket for wide company cover/banner images. */
export const COMPANY_COVER_BUCKET_SLUG = "__cover"

/** Per-company platform bucket for user template preview images. */
export const TEMPLATE_THUMBNAIL_BUCKET_SLUG = "__template-thumbnails"

/** Per-company auto-provisioned bucket for Sentroy Studio assets (audio samples,
 *  recordings, project artwork). **User-visible** — sentroy storage UI'da
 *  görünür çünkü kullanıcı sample'larını başka app'lerden de yönetebilmeli
 *  (örn. doğrudan storage'dan büyük batch yükle, Studio'da pick et).
 *  System-managed slug değil; auto-create edilse de kullanıcı için normal
 *  bir bucket. */
export const STUDIO_BUCKET_SLUG = "studio"

export const SYSTEM_MANAGED_BUCKET_SLUGS = [
  SYSTEM_BUCKET_SLUG,
  COMPANY_AVATAR_BUCKET_SLUG,
  COMPANY_COVER_BUCKET_SLUG,
  TEMPLATE_THUMBNAIL_BUCKET_SLUG,
] as const

/**
 * User-facing storage UI/API must not expose platform-owned buckets. `__`
 * prefix is reserved for future auto-managed buckets too.
 */
export function isSystemManagedBucketSlug(slug: string): boolean {
  return (
    slug.startsWith("__") ||
    (SYSTEM_MANAGED_BUCKET_SLUGS as readonly string[]).includes(slug)
  )
}
