"use client"

import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import { PlugSocketIcon } from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import { useNavigate } from "@/lib/router-compat"
import { useIsAdmin } from "@/lib/ui-flags-context"
import { osSwitchSection } from "@/lib/os-embed"

/**
 * Şirketin Linear workspace'i henüz bağlı değilken (linear_settings'te API
 * key yok) sayfaların gösterdiği boş durum. Yöneticilere Linear Ayarları'na
 * giden CTA sunar; yetkisi olmayan üyeler yalnız açıklamayı görür.
 */
export function NotConnected() {
  const t = useTranslations("linearLite.notConnected")
  const isAdmin = useIsAdmin()
  const navigate = useNavigate()

  // OS embed'inde iframe'i settings'e navigate ETME — o (overview/metrics)
  // section iframe'i strand olur ve OS geri getiremez. Bunun yerine OS'a
  // "linear-settings section'ına geç" de. Embed değilse normal navigasyon.
  const goToSettings = () => {
    if (!osSwitchSection("linear-settings")) navigate("/linear-settings")
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-dashed p-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <HugeiconsIcon icon={PlugSocketIcon} strokeWidth={2} className="size-6" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          {isAdmin ? t("description") : t("descriptionMember")}
        </p>
      </div>
      {isAdmin ? <Button onClick={goToSettings}>{t("cta")}</Button> : null}
    </div>
  )
}
