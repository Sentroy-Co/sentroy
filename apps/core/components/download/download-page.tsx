"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import { useRouter, usePathname } from "@workspace/auth/i18n/routing"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  AppleIcon,
  ComputerIcon,
  LaptopIcon,
  Download04Icon,
  ArrowLeft01Icon,
  SmartPhone01Icon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons"
import { LanguageCombobox } from "@workspace/console/components/shared/language-combobox"
import { cn } from "@workspace/ui/lib/utils"
import { useAppInstall } from "./use-app-install"
import type {
  DesktopRelease,
  DownloadAsset,
  DownloadPlatform,
} from "@/lib/desktop-downloads"

const RED = "#FF1744"
const LOCALES = ["en", "tr", "ru", "zh", "es"] as const

const PLATFORMS: {
  id: DownloadPlatform
  icon: typeof AppleIcon
  name: string
}[] = [
  { id: "mac", icon: AppleIcon, name: "macOS" },
  { id: "win", icon: ComputerIcon, name: "Windows" },
  { id: "linux", icon: LaptopIcon, name: "Linux" },
]

export function DownloadPage({
  lang,
  release,
}: {
  lang: string
  release: DesktopRelease
}) {
  const t = useTranslations("download")
  const router = useRouter()
  const pathname = usePathname()
  const { os, isMobile, canInstallPwa, installPwa } = useAppInstall()

  const byPlatform = useMemo(() => {
    const m: Record<DownloadPlatform, DownloadAsset[]> = { mac: [], win: [], linux: [] }
    for (const a of release.assets) m[a.platform].push(a)
    return m
  }, [release.assets])

  // Kullanıcının OS'u en başa gelsin.
  const ordered = useMemo(() => {
    const arr = [...PLATFORMS]
    if (os === "mac" || os === "win" || os === "linux") {
      arr.sort((a, b) => (a.id === os ? -1 : b.id === os ? 1 : 0))
    }
    return arr
  }, [os])

  return (
    <div className="min-h-dvh bg-[#F2F2F4] text-[#0A0A0A]">
      {/* Header — brand sayfasıyla aynı: geri + dil */}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#0A0A0A]/70 transition-colors hover:text-[#FF1744]"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" strokeWidth={2} />
          {t("back")}
        </button>
        <LanguageCombobox
          current={lang}
          locales={LOCALES}
          onSelect={(l) => router.replace(pathname, { locale: l as (typeof LOCALES)[number] })}
        />
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-24">
        {/* Hero */}
        <section className="pt-10 text-center">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
            style={{ backgroundColor: `${RED}14`, color: RED }}
          >
            <HugeiconsIcon icon={Download04Icon} className="size-3.5" strokeWidth={2.5} />
            {release.version ? t("versionLabel", { version: release.version }) : t("desktopApp")}
          </span>
          <h1 className="mt-5 text-4xl font-bold tracking-tight text-balance sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-[#0A0A0A]/60">
            {t("subtitle")}
          </p>
        </section>

        {/* Mobil cihaz → PWA "ana ekrana ekle" */}
        {isMobile ? (
          <section className="mt-10">
            <div className="mx-auto max-w-md rounded-3xl border border-[#0A0A0A]/10 bg-white p-6 text-center shadow-sm">
              <div
                className="mx-auto flex size-12 items-center justify-center rounded-2xl"
                style={{ backgroundColor: `${RED}14`, color: RED }}
              >
                <HugeiconsIcon icon={SmartPhone01Icon} className="size-6" strokeWidth={2} />
              </div>
              <h2 className="mt-4 text-lg font-semibold">{t("mobileTitle")}</h2>
              <p className="mt-1.5 text-sm text-[#0A0A0A]/60">{t("mobileDesc")}</p>
              {canInstallPwa ? (
                <button
                  type="button"
                  onClick={() => void installPwa()}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-transform hover:scale-[1.02]"
                  style={{ backgroundColor: RED }}
                >
                  <HugeiconsIcon icon={Download04Icon} className="size-4" strokeWidth={2.5} />
                  {t("mobileInstall")}
                </button>
              ) : (
                <p className="mt-4 rounded-2xl bg-[#F2F2F4] px-4 py-3 text-xs text-[#0A0A0A]/60">
                  {t("mobileManual")}
                </p>
              )}
            </div>
          </section>
        ) : null}

        {/* Masaüstü platform kartları */}
        <section className="mt-12">
          <div className="grid gap-4 sm:grid-cols-3">
            {ordered.map((p) => (
              <PlatformCard
                key={p.id}
                platform={p}
                assets={byPlatform[p.id]}
                recommended={os === p.id}
                t={t}
              />
            ))}
          </div>
        </section>

        {/* Tüm sürümler / GitHub */}
        {release.htmlUrl ? (
          <p className="mt-10 text-center text-sm text-[#0A0A0A]/50">
            <a
              href={release.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:text-[#FF1744]"
            >
              {t("allReleases")}
            </a>
          </p>
        ) : null}
      </main>
    </div>
  )
}

function PlatformCard({
  platform,
  assets,
  recommended,
  t,
}: {
  platform: { id: DownloadPlatform; icon: typeof AppleIcon; name: string }
  assets: DownloadAsset[]
  recommended: boolean
  t: ReturnType<typeof useTranslations>
}) {
  const hasBuilds = assets.length > 0
  return (
    <div
      className={cn(
        "relative flex flex-col rounded-3xl border bg-white p-6 shadow-sm transition-shadow hover:shadow-md",
        recommended ? "border-[#FF1744]/40" : "border-[#0A0A0A]/10",
      )}
      style={recommended ? { boxShadow: `0 0 0 1px ${RED}25, 0 8px 30px -12px ${RED}40` } : undefined}
    >
      {recommended ? (
        <span
          className="absolute -top-2.5 left-6 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white"
          style={{ backgroundColor: RED }}
        >
          <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3" strokeWidth={2.5} />
          {t("forYourDevice")}
        </span>
      ) : null}

      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-[#0A0A0A]/5 text-[#0A0A0A]">
          <HugeiconsIcon icon={platform.icon} className="size-6" strokeWidth={1.8} />
        </div>
        <span className="text-lg font-semibold">{platform.name}</span>
      </div>

      <div className="mt-5 flex flex-1 flex-col justify-end gap-2">
        {hasBuilds ? (
          assets.map((a) => (
            <a
              key={a.url}
              href={a.url}
              className={cn(
                "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition-transform hover:scale-[1.02]",
                assets.length === 1 || a === assets[0]
                  ? "text-white"
                  : "border border-[#0A0A0A]/12 text-[#0A0A0A]/80 hover:border-[#FF1744]/40 hover:text-[#FF1744]",
              )}
              style={
                assets.length === 1 || a === assets[0]
                  ? { backgroundColor: RED }
                  : undefined
              }
            >
              <HugeiconsIcon icon={Download04Icon} className="size-4" strokeWidth={2.5} />
              {a.label}
            </a>
          ))
        ) : (
          <span className="inline-flex items-center justify-center rounded-full bg-[#F2F2F4] px-4 py-2.5 text-sm font-medium text-[#0A0A0A]/40">
            {t("comingSoon")}
          </span>
        )}
      </div>
    </div>
  )
}
