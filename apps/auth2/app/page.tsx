import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { detectLocale } from "@/lib/i18n"

/**
 * Root → detect locale → 302 to `/[lang]`. Auth2'nin tüm UI sayfaları
 * `[lang]` segmentinde; root sadece detect + forward.
 *
 * Locale detection sırası:
 *   1. `Accept-Language` header (browser preference)
 *   2. fallback: `en`
 */

export const dynamic = "force-dynamic"

export default async function RootRedirect() {
  const hdrs = await headers()
  const locale = detectLocale(hdrs.get("accept-language"))
  redirect(`/${locale}`)
}
