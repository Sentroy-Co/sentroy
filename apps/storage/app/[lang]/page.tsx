import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@workspace/auth/server/auth"

/**
 * storage.sentroy.com/{lang} — login user'lar storage dashboard'una gider.
 * Anonim ziyaretçiler CORE landing'e (sentroy.com) yönlendirilir: core landing
 * tüm ürünleri (storage dahil) anlatıyor; ürün-başı ayrı pazarlama landing'i
 * çift içerik yaratıyordu. Eski `StorageLandingPage` (components/landing/
 * storage-landing.tsx) artık kullanılmıyor (ayrıca silinebilir).
 */
export default async function StorageRootPage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  const session = await auth.api.getSession({ headers: await headers() })

  if (session) {
    redirect(`/${lang}/d`)
  }

  const coreUrl =
    process.env.NEXT_PUBLIC_CORE_APP_URL ||
    process.env.CORE_APP_URL ||
    "https://sentroy.com"
  // next/navigation redirect() harici/absolute URL kabul eder → 307.
  redirect(`${coreUrl}/${lang}`)
}
