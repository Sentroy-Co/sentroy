"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { useTranslations } from "next-intl"
import { motion } from "framer-motion"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Sun03Icon,
  Moon02Icon,
  Globe02Icon,
  Tick02Icon,
  Logout01Icon,
  Building03Icon,
  ArrowRight01Icon,
  Loading03Icon,
} from "@hugeicons/core-free-icons"
import { Logo } from "@workspace/console/components/shared/logo"
import { authClient } from "@workspace/auth/client/auth-client"
import { useCompanyStore } from "@workspace/console/stores/company"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
} from "@workspace/ui/components/dropdown-menu"
import { Input } from "@workspace/ui/components/input"
import { Button } from "@workspace/ui/components/button"
import { WallpaperPicker } from "./wallpaper"
import { CalendarPopover } from "./calendar-popover"
import { PendingInvitations } from "./pending-invitations"
import type { OsUser } from "./menu-bar"

const LOCALES = ["en", "tr", "ru", "zh", "es"] as const
const LOCALE_NAMES: Record<string, string> = { en: "English", tr: "Türkçe" }

/**
 * Sentroy OS — "first-run" ekranı: hiç şirketi olmayan kullanıcı için. Düz
 * şirket-seçim yerine OS chrome hissi: wallpaper (parent WallpaperLayer) üstünde
 * minimal OS top-bar + ortada cam "workspace oluştur" hero'su. Kullanıcı bir
 * OS'ta oturum (workspace) yaratıyormuş gibi hisseder.
 */
export function FirstRun({
  lang,
  user,
  onCreated,
}: {
  lang: string
  user: OsUser
  onCreated: (slug: string) => void
}) {
  const t = useTranslations("os")
  const { resolvedTheme, setTheme } = useTheme()
  const dark = resolvedTheme === "dark"

  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    const tick = () => setNow(new Date())
    tick()
    const id = setInterval(tick, 15_000)
    return () => clearInterval(id)
  }, [])
  const time = now ? now.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" }) : ""
  const dateShort = now ? now.toLocaleDateString(lang, { weekday: "short", day: "numeric", month: "short" }) : ""

  const [name, setName] = useState("")
  const [creating, setCreating] = useState(false)

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || creating) return
    setCreating(true)
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || t("createCompanyDialog.failed"))
        setCreating(false)
        return
      }
      toast.success(t("createCompanyDialog.created"))
      await useCompanyStore.getState().fetchCompanies(true)
      onCreated(json.data.slug as string)
    } catch {
      toast.error(t("common.somethingWrong"))
      setCreating(false)
    }
  }

  // Bekleyen davet kabul edilince: şirket listesini tazele + o şirkete geç.
  async function handleInviteAccepted(slug: string) {
    await useCompanyStore.getState().fetchCompanies(true)
    onCreated(slug)
  }

  return (
    <div className="relative z-10 flex h-full flex-col">
      {/* Minimal OS top-bar */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-white/15 bg-white/25 px-3 shadow-sm backdrop-blur-2xl backdrop-saturate-150 dark:border-white/10 dark:bg-black/30">
        <div className="flex items-center px-1.5">
          <Logo size="sm" />
        </div>
        <div className="flex-1" />
        <div className="flex shrink-0 items-center gap-1">
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
                  <DropdownMenuItem
                    key={l}
                    onClick={() => {
                      if (l !== lang) window.location.assign(`/${l}/d`)
                    }}
                    className="gap-2"
                  >
                    <span className="flex-1">{LOCALE_NAMES[l]}</span>
                    {l === lang ? <HugeiconsIcon icon={Tick02Icon} className="size-4 text-primary" strokeWidth={2.5} /> : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <WallpaperPicker />

          <button
            type="button"
            onClick={() => setTheme(dark ? "light" : "dark")}
            className="flex size-7 items-center justify-center rounded-md hover:bg-black/5 dark:hover:bg-white/10"
            aria-label={t("toggleTheme")}
          >
            <HugeiconsIcon icon={dark ? Sun03Icon : Moon02Icon} className="size-4" strokeWidth={2} />
          </button>

          {now ? <CalendarPopover label={`${dateShort}  ${time}`} lang={lang} /> : <span className="px-2" />}

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

      {/* Ortada cam "workspace oluştur" hero — üstünde bekleyen davetler */}
      <div className="flex flex-1 flex-col items-center justify-center gap-4 overflow-y-auto p-6">
        <PendingInvitations onAccepted={handleInviteAccepted} />
        <motion.div
          initial={{ opacity: 0, y: 14, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 26 }}
          className="w-full max-w-md rounded-3xl border border-white/20 bg-white/15 p-8 shadow-2xl ring-1 ring-white/10 backdrop-blur-2xl backdrop-saturate-150 dark:border-white/10 dark:bg-black/25"
        >
          <div className="flex flex-col items-center gap-4 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/90 shadow-lg">
              <HugeiconsIcon icon={Building03Icon} className="size-7 text-primary-foreground" strokeWidth={2} />
            </span>
            <div className="space-y-1">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                {t("firstRun.welcomeTitle")}
              </h1>
              <p className="text-sm text-muted-foreground">{t("firstRun.welcomeSubtitle")}</p>
            </div>
          </div>

          <form onSubmit={handleCreate} className="mt-6 flex flex-col gap-3">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("createCompanyDialog.namePlaceholder")}
              autoFocus
              maxLength={80}
              className="h-11 bg-background/70 text-center text-base"
            />
            <Button
              type="submit"
              disabled={creating || !name.trim()}
              className="h-11 w-full rounded-xl text-base"
            >
              {creating ? (
                <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" strokeWidth={2} data-icon="inline-start" />
              ) : (
                <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" strokeWidth={2} data-icon="inline-end" />
              )}
              {creating ? t("createCompanyDialog.creating") : t("firstRun.createWorkspace")}
            </Button>
          </form>
        </motion.div>
      </div>
    </div>
  )
}
