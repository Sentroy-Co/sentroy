"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Download04Icon,
  AppleIcon,
  ComputerIcon,
  LaptopIcon,
  SmartPhone01Icon,
} from "@hugeicons/core-free-icons"
import { useAppInstall } from "./use-app-install"

const RED = "#FF1744"
const DISMISS_KEY = "sentroy-app-promo-dismissed"

/**
 * Sol-alt "uygulamayı indir" promo popup'ı — landing + OS'ta. Kurallar:
 *  - Electron kabuğunda / zaten PWA olarak yüklüyken → GÖSTERME (zaten app).
 *  - Mobilde: yalnız PWA install destekleniyorsa "ana ekrana ekle" göster.
 *  - Masaüstü tarayıcıda: cihaza uygun native uygulamayı öne çıkar → /download.
 *  - Kapatılabilir (localStorage; bir daha bu cihaza nag yok).
 *  - NEXT_PUBLIC_APP_DOWNLOAD_ENABLED=false → tamamen kapalı.
 */
export function GetAppPopup({ lang }: { lang: string }) {
  const t = useTranslations("download")
  const { ready, os, isElectron, isMobile, isStandalone, canInstallPwa, installPwa } =
    useAppInstall()
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_APP_DOWNLOAD_ENABLED === "false") return
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1")
    } catch {
      setDismissed(false)
    }
  }, [])

  const disabledByEnv = process.env.NEXT_PUBLIC_APP_DOWNLOAD_ENABLED === "false"
  // Mobilde yalnız yükleme mümkünse; masaüstünde her zaman (Electron/standalone hariç).
  const mobileEligible = isMobile && canInstallPwa
  const desktopEligible = !isMobile && (os === "mac" || os === "win" || os === "linux")
  const show =
    ready &&
    !disabledByEnv &&
    !dismissed &&
    !isElectron &&
    !isStandalone &&
    (mobileEligible || desktopEligible)

  if (!show) return null

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1")
    } catch {
      /* ignore */
    }
    setDismissed(true)
  }

  const icon =
    isMobile
      ? SmartPhone01Icon
      : os === "mac"
        ? AppleIcon
        : os === "win"
          ? ComputerIcon
          : LaptopIcon
  const osName =
    os === "mac" ? "macOS" : os === "win" ? "Windows" : os === "linux" ? "Linux" : ""

  return (
    <div className="fixed bottom-4 left-4 z-[60] w-[min(20rem,calc(100vw-2rem))] animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="relative overflow-hidden rounded-2xl border border-black/10 bg-white/95 p-4 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/95">
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("dismiss")}
          className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full text-black/40 transition-colors hover:bg-black/5 hover:text-black/70 dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white/70"
        >
          <span className="text-sm leading-none">×</span>
        </button>

        <div className="flex items-start gap-3">
          <div
            className="flex size-10 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${RED}14`, color: RED }}
          >
            <HugeiconsIcon icon={icon} className="size-5" strokeWidth={2} />
          </div>
          <div className="min-w-0 pr-4">
            <p className="text-sm font-semibold text-neutral-900 dark:text-white">
              {isMobile ? t("promoMobileTitle") : t("promoDesktopTitle")}
            </p>
            <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
              {isMobile
                ? t("promoMobileDesc")
                : t("promoDesktopDesc", { os: osName })}
            </p>
          </div>
        </div>

        {isMobile ? (
          <button
            type="button"
            onClick={() => void installPwa()}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white transition-transform hover:scale-[1.02]"
            style={{ backgroundColor: RED }}
          >
            <HugeiconsIcon icon={Download04Icon} className="size-4" strokeWidth={2.5} />
            {t("promoMobileCta")}
          </button>
        ) : (
          <a
            href={`/${lang}/download`}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white transition-transform hover:scale-[1.02]"
            style={{ backgroundColor: RED }}
          >
            <HugeiconsIcon icon={Download04Icon} className="size-4" strokeWidth={2.5} />
            {t("promoDesktopCta")}
          </a>
        )}
      </div>
    </div>
  )
}
