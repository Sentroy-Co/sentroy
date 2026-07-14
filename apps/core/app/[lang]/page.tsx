import { setRequestLocale } from "next-intl/server"
import { LandingPage } from "@/components/landing/landing-page"
import { LandingV2 } from "@/components/landing/v2/landing-v2"

// Yalnız ANONİM kullanıcılar landing'i görür — login olmuş kullanıcılar
// proxy.ts'te locale-root'tan `/<lang>/d`'ye yönlendirilir (cookie-presence;
// anon isteklerde cookie yok → CF-cached static landing korunur).
//
// v2 ("Web'de Sentroy OS" scroll-anlatısı) VARSAYILANDIR. Eski landing'e geri
// dönüş: Coolify core env'ine LANDING_LEGACY=1 ekle + redeploy — kod silinmedi,
// components/landing/landing-page.tsx olduğu gibi durur.
export default async function RootPage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  setRequestLocale(lang)
  if (process.env.LANDING_LEGACY === "1") {
    return <LandingPage lang={lang} />
  }
  return (
    <>
      {/* LCP hero (valley) preload — React `<link>`'i <head>'e hoist eder;
          yalnız v2 landing'de basılır (shared layout'a KOYMA → auth/admin'de
          gereksiz preload olur). srcset preload = img srcset ile byte-aynı. */}
      <link
        rel="preload"
        as="image"
        href="/os-wallpapers/valley.webp"
        imageSrcSet="/os-wallpapers/valley-800.webp 800w, /os-wallpapers/valley.webp 1600w"
        imageSizes="100vw"
        fetchPriority="high"
      />
      <LandingV2 lang={lang} />
    </>
  )
}
