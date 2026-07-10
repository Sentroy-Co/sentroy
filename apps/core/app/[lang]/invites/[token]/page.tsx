import type { Metadata } from "next"
import { Suspense } from "react"
import { getTranslations } from "next-intl/server"
import { InviteAcceptance } from "@workspace/auth/components/invite-acceptance"
import { Logo } from "@workspace/console/components/shared"
import { wallpaperById, DEFAULT_WALLPAPER } from "@/components/os/wallpapers"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  const t = await getTranslations({ locale: lang, namespace: "auth" })
  return { title: t("invitesTitle") }
}

/**
 * Davet kabul sayfası — auth sayfalarıyla (login/signup) tutarlı OS görünümü:
 * OS masaüstü duvar kâğıdı (default aurora) + ortalı cam kart. `(auth)` route
 * grubunun dışında olduğu için wallpaper'ı burada inline veriyoruz.
 */
export default async function InviteAcceptancePage({
  params,
}: {
  params: Promise<{ lang: string; token: string }>
}) {
  const { token } = await params
  const wp = wallpaperById(DEFAULT_WALLPAPER)

  return (
    <div className="relative flex min-h-svh w-full items-center justify-center overflow-hidden p-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={wp.src}
        alt=""
        className="fixed inset-0 -z-10 h-full w-full object-cover"
      />
      <div className="fixed inset-0 -z-10 bg-black/35" />
      <div className="w-full max-w-md rounded-3xl border border-white/20 bg-card/90 p-7 shadow-2xl ring-1 ring-white/10 backdrop-blur-2xl backdrop-saturate-150 dark:border-white/10">
        <div className="mb-6 flex justify-center">
          <Logo size="md" />
        </div>
        <Suspense>
          <InviteAcceptance token={token} />
        </Suspense>
      </div>
    </div>
  )
}
