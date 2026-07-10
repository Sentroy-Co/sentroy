"use client"

import { useEffect, useRef } from "react"
import { usePathname, useRouter, useParams } from "next/navigation"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { useCompanyStore } from "@workspace/console/stores/company"
import { useSession } from "@workspace/auth/client/auth-client"
import { canAccessRoute, extractRouteSegment } from "@workspace/auth/server/route-permissions"

/**
 * Kullanici yetkisi olmayan bir dashboard sayfasina dogrudan URL ile
 * geldiginde sirket anasayfasina yonlendirir ve bilgilendirme gosterir.
 *
 * API route'larindaki izin kontrollerinin yedek UX katmani — gercek guvenlik
 * backend'de, bu yalnizca kullaniciyi yanlis sayfaya birakmamak icin.
 *
 * **Loop koruması:** Bazı app'lerin company-root sayfası (ör. storage'ın
 * `/d/[slug]` route'u `/usage`'a server-side redirect ediyor) yetkisiz
 * user'ı tekrar yetkisiz sayfaya gönderir → route-guard tekrar kicks in →
 * sonsuz ping-pong + her cycle'da yeni toast.
 *
 * Çözüm: (1) `toast.error` stable `id` ile dedup — sonner aynı id'li
 * toast'ı eskinin üstüne yazar, yığılma yok. (2) `redirectedFrom` ref
 * "bu segment'ten bir kez redirect ettik" işaretler; aynı segment'e geri
 * gelirsek (kapalı döngü), redirect'i yapma, sadece toast'ı koru.
 * Cross-app fallback için `NEXT_PUBLIC_CORE_APP_URL` ile core teams
 * selector'a tam-window navigation öneriyoruz — single-app loop'tan
 * çıkış kapısı.
 */
export function RouteGuard() {
  const pathname = usePathname()
  const router = useRouter()
  const params = useParams()
  const t = useTranslations("common")

  const membership = useCompanyStore((s) => s.membership)
  const { data: session } = useSession()
  const systemRole = (session?.user as { role?: string } | undefined)?.role

  const lang = params.lang as string | undefined
  const slug = params["company-slug"] as string | undefined

  // Daha önce hangi segment'lerden redirect ettik — aynı segment'e geri
  // gelirsek (server redirect bizi getiriyorsa) ikinci kez router.replace
  // yapma, full-window cross-app navigation'a düş.
  const redirectedFromRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!lang || !slug || !membership) return

    const segment = extractRouteSegment(pathname, lang, slug)
    if (segment === null) return

    if (canAccessRoute(membership, segment, systemRole)) {
      // Erişim açıldı — bu segment'i redirect-history'den temizle (user
      // permission'ı geri kazandıysa tekrar deneyebilelim).
      redirectedFromRef.current.delete(segment)
      return
    }

    // Sonner dedup — aynı id ile toast'ı tek tut, stack olmasın.
    toast.error(t("noPermission"), { id: "route-guard-no-permission" })

    // Bu segment'ten daha önce redirect ettiysek + yine buraya geldiysek,
    // app-içi root döngüye giriyor demek. Cross-app çıkış: core'un teams
    // selector'una full-window navigate.
    if (redirectedFromRef.current.has(segment)) {
      const coreUrl =
        process.env.NEXT_PUBLIC_CORE_APP_URL || "https://sentroy.com"
      if (typeof window !== "undefined") {
        window.location.href = `${coreUrl}/${lang}/d`
      }
      return
    }

    redirectedFromRef.current.add(segment)
    router.replace(`/${lang}/d/${slug}`)
  }, [pathname, lang, slug, membership, systemRole, router, t])

  return null
}
