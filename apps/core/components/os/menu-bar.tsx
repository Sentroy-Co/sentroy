"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Sun03Icon,
  Moon02Icon,
  Logout01Icon,
  Settings02Icon,
  Globe02Icon,
  Tick02Icon,
  UserCircleIcon,
  Search01Icon,
  Notification03Icon,
  HelpCircleIcon,
} from "@hugeicons/core-free-icons"
import { useNotificationsStore } from "@workspace/console/stores/notifications"
import { Logo } from "@workspace/console/components/shared/logo"
import { CompanyAvatar } from "@workspace/console/components/shared/company-avatar"
import { authClient } from "@workspace/auth/client/auth-client"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
} from "@workspace/ui/components/dropdown-menu"
import { WallpaperPicker } from "./wallpaper"
import { CalendarPopover } from "./calendar-popover"
import { AchievementsMenuPill } from "./achievements/menu-bar-pill"
import type { AppDescriptor } from "@workspace/console/components/layout/app-launcher"

const LOCALES = ["en", "tr", "ru", "zh", "es"] as const
const LOCALE_NAMES: Record<string, string> = { en: "English", tr: "Türkçe" }

export interface OsCompany {
  id: string
  name: string
  slug: string
  avatarUrl?: string | null
}
export interface OsUser {
  id: string
  name?: string | null
  email: string
  image?: string | null
}

export function MenuBar({
  lang,
  active,
  user,
  systemScreens,
  onOpenSettings,
  onOpenApp,
  onOpenSpotlight,
  onToggleWidgets,
  onOpenProfile,
  onOpenNotifications,
  onOpenAchievements,
  onStartTour,
}: {
  lang: string
  active: OsCompany | null
  user: OsUser
  systemScreens: AppDescriptor[]
  onOpenSettings: (category?: string) => void
  onOpenApp: (id: string) => void
  onOpenSpotlight: () => void
  onToggleWidgets: () => void
  onOpenProfile: () => void
  onOpenNotifications: () => void
  /** Achievements penceresini aç (menü-bar pill'i — widget masaüstünde yokken). */
  onOpenAchievements: () => void
  /** OS tanıtım turunu (yeniden) başlat. */
  onStartTour: () => void
}) {
  const { resolvedTheme, setTheme } = useTheme()
  const notifUnread = useNotificationsStore((s) =>
    s.items.reduce((n, i) => (i.read ? n : n + 1), 0),
  )
  const dark = resolvedTheme === "dark"
  const t = useTranslations("os")

  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    const tick = () => setNow(new Date())
    tick()
    const id = setInterval(tick, 15_000)
    return () => clearInterval(id)
  }, [])
  const time = now ? now.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" }) : ""
  const dateShort = now ? now.toLocaleDateString(lang, { weekday: "short", day: "numeric", month: "short" }) : ""

  function changeLocale(l: string) {
    if (l === lang) return
    // OS her zaman /[lang]/d'de — locale segmentini deterministik değiştir
    // (next-intl usePathname bu route'ta strip etmiyordu → /en/tr/d bug'ı).
    window.location.assign(`/${l}/d`)
  }

  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-white/15 bg-white/25 px-3 shadow-sm backdrop-blur-2xl backdrop-saturate-150 dark:border-white/10 dark:bg-black/30">
      {/* Apple-menü deseni — logo, System Settings penceresini ve core overview
          ekranını açar. Core artık ayrı bir dock app'i değil. */}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center rounded-md px-1.5 py-1 outline-none hover:bg-black/5 dark:hover:bg-white/10">
          <Logo size="sm" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Sentroy</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onOpenSettings()} className="gap-2">
              <HugeiconsIcon icon={Settings02Icon} className="size-4" strokeWidth={2} />
              {t("systemSettings")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onStartTour} className="gap-2">
              <HugeiconsIcon icon={HelpCircleIcon} className="size-4" strokeWidth={2} />
              {t("tour.restart")}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {systemScreens.map((s) => (
              <DropdownMenuItem key={s.id} onClick={() => onOpenApp(s.id)} className="gap-2">
                <HugeiconsIcon icon={s.icon} className="size-4" strokeWidth={2} />
                {s.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex-1" />

      <div className="flex shrink-0 items-center gap-1">
        {/* Spotlight arama */}
        <button
          type="button"
          onClick={onOpenSpotlight}
          className="flex size-7 items-center justify-center rounded-md hover:bg-black/5 dark:hover:bg-white/10"
          aria-label={`${t("search")} (⌘K)`}
          title={`${t("search")} — ⌘K`}
        >
          <HugeiconsIcon icon={Search01Icon} className="size-4" strokeWidth={2} />
        </button>

        {/* Dil seçici */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex size-7 items-center justify-center rounded-md outline-none hover:bg-black/5 dark:hover:bg-white/10"
            aria-label={t("language")}
          >
            <HugeiconsIcon icon={Globe02Icon} className="size-4" strokeWidth={2} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t("language")}</DropdownMenuLabel>
              {LOCALES.map((l) => (
                <DropdownMenuItem key={l} onClick={() => changeLocale(l)} className="gap-2">
                  <span className="flex-1">{LOCALE_NAMES[l]}</span>
                  {l === lang ? <HugeiconsIcon icon={Tick02Icon} className="size-4 text-primary" strokeWidth={2.5} /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <WallpaperPicker />

        {/* Bildirim merkezi — sağdan açılan widget'ın notifications view'ı. */}
        <button
          type="button"
          onClick={onOpenNotifications}
          className="relative flex size-7 items-center justify-center rounded-md hover:bg-black/5 dark:hover:bg-white/10"
          aria-label={t("notifications.title")}
          title={t("notifications.title")}
        >
          <HugeiconsIcon icon={Notification03Icon} className="size-4" strokeWidth={2} />
          {notifUnread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white">
              {notifUnread > 9 ? "9+" : notifUnread}
            </span>
          ) : null}
        </button>

        <button
          type="button"
          onClick={() => setTheme(dark ? "light" : "dark")}
          className="flex size-7 items-center justify-center rounded-md hover:bg-black/5 dark:hover:bg-white/10"
          aria-label={t("toggleTheme")}
        >
          <HugeiconsIcon icon={dark ? Sun03Icon : Moon02Icon} className="size-4" strokeWidth={2} />
        </button>

        {/* Başarımlar pill'i — masaüstü widget'ı kaldırılmışsa ve ilerleme
            <%100 ise görünür (saat bölgesinin solunda). */}
        <AchievementsMenuPill slug={active?.slug ?? null} onOpen={onOpenAchievements} />

        {/* Saat/tarih → takvim popover */}
        {now ? <CalendarPopover label={`${dateShort}  ${time}`} lang={lang} /> : <span className="px-2" />}

        {/* Aktif şirket (salt-görünüm) — tıkla → Activity widget (public profil).
            Şirket değiştirme widget başlığındaki switcher'da. */}
        <button
          type="button"
          data-tour="menubar-company"
          onClick={onToggleWidgets}
          className="ml-1 flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium outline-none hover:bg-black/5 dark:hover:bg-white/10"
          title={active?.name ?? ""}
        >
          <CompanyAvatar name={active?.name ?? ""} avatarUrl={active?.avatarUrl ?? null} size="xs" />
          <span className="max-w-[150px] truncate">{active?.name ?? t("selectCompany")}</span>
        </button>

        {/* Avatar / hesap menüsü */}
        <DropdownMenu>
          <DropdownMenuTrigger className="ml-0.5 flex items-center rounded-full outline-none ring-offset-2 ring-offset-transparent focus-visible:ring-2 focus-visible:ring-primary">
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.image} alt="" className="size-7 rounded-full object-cover" />
            ) : (
              <span className="flex size-7 items-center justify-center rounded-full bg-primary text-[11px] font-medium text-primary-foreground">
                {(user.name || user.email).charAt(0).toUpperCase()}
              </span>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <div className="flex items-center gap-3 px-2 py-2">
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.image} alt="" className="size-10 rounded-full object-cover" />
              ) : (
                <span className="flex size-10 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
                  {(user.name || user.email).charAt(0).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{user.name || t("account")}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onOpenProfile} className="gap-2">
                <HugeiconsIcon icon={UserCircleIcon} className="size-4" strokeWidth={2} />
                {t("profile")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onOpenSettings()} className="gap-2">
                <HugeiconsIcon icon={Settings02Icon} className="size-4" strokeWidth={2} />
                {t("systemSettings")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() => void authClient.signOut().then(() => (window.location.href = `/${lang}/login`))}
                className="gap-2"
              >
                <HugeiconsIcon icon={Logout01Icon} className="size-4" strokeWidth={2} />
                {t("signOut")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
