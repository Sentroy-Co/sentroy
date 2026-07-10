"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Cancel01Icon,
  UserMultipleIcon,
  Settings02Icon,
  ArrowDown01Icon,
  Add01Icon,
  Mail01Icon,
  KanbanIcon,
  Notification03Icon,
  Delete02Icon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons"
import { formatDistanceToNow } from "date-fns"
import {
  useNotificationsStore,
  type AppNotification,
} from "@workspace/console/stores/notifications"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
} from "@workspace/ui/components/dropdown-menu"
import { CompanyAvatar } from "@workspace/console/components/shared/company-avatar"
import type { AppDescriptor } from "@workspace/console/components/layout/app-launcher"
import { useOsStore } from "./os-store"
import { CompanyFeedStack } from "./company-feed-stack"
import { WidgetGallery } from "./widgets/widget-gallery"
import type { OsUser, OsCompany } from "./menu-bar"

export type WidgetView = "activity" | "widgets" | "profile" | "notifications" | null

interface CompanyData {
  slug: string
  name: string
  avatarUrl?: string | null
  coverImageUrl?: string | null
  description?: string | null
  memberCount?: number
  membership?: { role?: string }
}

/**
 * Sağdan açılan macOS "Bugün/Bildirim Merkezi" tarzı widget paneli.
 *  - view="activity": aktif şirketin profil kartı + post composer + akış.
 *  - view="widgets": masaüstü widget GALERİSİ (registry tipleri + "Add").
 *  - view="profile": kullanıcının PUBLIC profili (embed iframe).
 * Activity ↔ Widgets arasında başlıktaki segmented sekmeyle geçilir.
 * Arka plana tıklayınca kapanır.
 */
export function WidgetPanel({
  lang,
  slug,
  user,
  view,
  onClose,
  onViewChange,
  companies,
  active,
  onSwitch,
  onCreateCompany,
  apps = [],
}: {
  lang: string
  slug: string | null
  user: OsUser
  view: WidgetView
  onClose: () => void
  /** Panel içi sekme geçişi (activity ↔ widgets). */
  onViewChange: (view: WidgetView) => void
  companies: OsCompany[]
  active: OsCompany | null
  onSwitch: (c: OsCompany) => void
  onCreateCompany: () => void
  /** Stage app'leri — widget galerisi permGate filtresi. */
  apps?: AppDescriptor[]
}) {
  const t = useTranslations("os")
  const open = view !== null

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onPointerDown={onClose}
            className="fixed inset-x-0 bottom-0 top-10 z-[45] bg-black/10"
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="fixed bottom-2 right-2 top-12 z-50 flex w-[440px] max-w-[92vw] flex-col overflow-hidden rounded-2xl border border-white/15 bg-background/85 shadow-[0_24px_70px_-12px_rgba(0,0,0,0.5)] backdrop-blur-2xl backdrop-saturate-150 dark:border-white/10"
          >
            <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3 pr-3">
              {view === "profile" ? (
                <span className="px-1 text-sm font-semibold text-foreground">{t("profile")}</span>
              ) : view === "notifications" ? (
                <span className="px-1 text-sm font-semibold text-foreground">{t("notifications.title")}</span>
              ) : (
                <>
                  <WidgetCompanySwitcher
                    companies={companies}
                    active={active}
                    onSwitch={onSwitch}
                    onCreateCompany={onCreateCompany}
                  />
                  {/* Activity ↔ Widgets segmented sekmeleri */}
                  <div className="ml-auto flex items-center gap-0.5 rounded-lg bg-foreground/5 p-0.5">
                    {(
                      [
                        { id: "activity" as const, label: t("widgetsHub.activityTab") },
                        { id: "widgets" as const, label: t("widgetsHub.tab") },
                      ]
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => onViewChange(tab.id)}
                        className={
                          "rounded-md px-2 py-0.5 text-xs font-medium transition-colors " +
                          (view === tab.id
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground")
                        }
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label={t("window.close")}
                className="flex size-6 shrink-0 items-center justify-center rounded-md text-foreground/60 hover:bg-foreground/10 hover:text-foreground"
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-4" strokeWidth={2} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
              {view === "profile" ? (
                <ProfileView lang={lang} onClose={onClose} />
              ) : view === "notifications" ? (
                <NotificationsView onClose={onClose} />
              ) : view === "widgets" ? (
                <WidgetGallery apps={apps} />
              ) : (
                <ActivityView lang={lang} slug={slug} user={user} onClose={onClose} />
              )}
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  )
}

/**
 * OS bildirim merkezi — sağdan açılan widget'ın "notifications" view'ı.
 * `useNotificationsStore`'u okur (NotificationsProvider OS shell'de mount'lu →
 * mail-delivered SSE + hydrateFromServer ile mail + Linear + davet bildirimleri).
 * Linear bildirimleri absolute href taşır (linear.sentroy.com/...) → tıklamada
 * full navigation (window.location.assign).
 */
function NotificationsView({ onClose }: { onClose: () => void }) {
  const t = useTranslations("os")
  const { items, markRead, markAllRead, remove, clear } = useNotificationsStore()
  const unread = items.filter((i) => !i.read).length

  const iconFor = (type: AppNotification["type"]) =>
    type === "mail-delivered" ? Mail01Icon : type === "linear" ? KanbanIcon : Notification03Icon

  const onItemClick = (item: AppNotification) => {
    markRead(item.id)
    if (!item.href) return
    const isAbsolute = /^https?:\/\//i.test(item.href)
    if (
      isAbsolute &&
      typeof window !== "undefined" &&
      !item.href.startsWith(window.location.origin)
    ) {
      window.location.assign(item.href)
    } else if (typeof window !== "undefined") {
      window.location.assign(item.href)
    }
    onClose()
  }

  return (
    <div className="flex h-full flex-col">
      {items.length > 0 ? (
        <div className="flex shrink-0 items-center justify-end gap-1 border-b border-border/60 px-2 py-1.5">
          {unread > 0 ? (
            <button
              type="button"
              onClick={markAllRead}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
            >
              <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3" strokeWidth={2} />
              {t("notifications.markAllRead")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={clear}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
          >
            {t("notifications.clear")}
          </button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <HugeiconsIcon icon={Notification03Icon} className="size-6" strokeWidth={2} />
            </span>
            <p className="text-sm text-muted-foreground">{t("notifications.empty")}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {items.map((item) => {
              let time = ""
              try {
                time = formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })
              } catch {
                time = ""
              }
              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onItemClick(item)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      onItemClick(item)
                    }
                  }}
                  className={
                    "group flex cursor-pointer items-start gap-3 rounded-lg p-3 transition-colors hover:bg-foreground/5 " +
                    (!item.read ? "bg-primary/5" : "")
                  }
                >
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <HugeiconsIcon icon={iconFor(item.type)} className="size-4" strokeWidth={2} />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className={"truncate text-sm " + (!item.read ? "font-semibold" : "font-normal")}>
                        {item.title}
                      </span>
                      {!item.read ? <span className="size-1.5 shrink-0 rounded-full bg-primary" /> : null}
                    </div>
                    {item.description ? (
                      <p className="truncate text-xs text-muted-foreground">{item.description}</p>
                    ) : null}
                    <span className="text-[10px] text-muted-foreground/70">{time}</span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      remove(item.id)
                    }}
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/10 group-hover:opacity-100"
                    aria-label={t("notifications.remove")}
                  >
                    <HugeiconsIcon icon={Delete02Icon} className="size-3.5" strokeWidth={2} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function WidgetCompanySwitcher({
  companies,
  active,
  onSwitch,
  onCreateCompany,
}: {
  companies: OsCompany[]
  active: OsCompany | null
  onSwitch: (c: OsCompany) => void
  onCreateCompany: () => void
}) {
  const t = useTranslations("os")
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-sm font-semibold outline-none hover:bg-foreground/5">
        <CompanyAvatar name={active?.name ?? ""} avatarUrl={active?.avatarUrl ?? null} size="xs" />
        <span className="max-w-[220px] truncate">{active?.name ?? t("selectCompany")}</span>
        <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 shrink-0 opacity-60" strokeWidth={2} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("companies")}</DropdownMenuLabel>
          {companies.map((c) => (
            <DropdownMenuItem key={c.id} onClick={() => onSwitch(c)} className="gap-2">
              <CompanyAvatar name={c.name} avatarUrl={c.avatarUrl ?? null} size="xs" />
              <span className="truncate">{c.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={onCreateCompany} className="gap-2">
            <span className="flex size-5 items-center justify-center rounded-md border border-dashed border-foreground/30">
              <HugeiconsIcon icon={Add01Icon} className="size-3.5" strokeWidth={2} />
            </span>
            <span>{t("createCompany")}</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Spinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <span className="size-7 animate-spin rounded-full border-2 border-muted border-t-foreground/40" />
    </div>
  )
}

// ── Activity (company) ───────────────────────────────────────────────────────
function ActivityView({ lang, slug, user, onClose }: { lang: string; slug: string | null; user: OsUser; onClose: () => void }) {
  const [data, setData] = useState<CompanyData | null>(null)
  useEffect(() => {
    if (!slug) return
    let cancelled = false
    setData(null)
    ;(async () => {
      try {
        const r = await fetch(`/api/companies/${slug}`)
        if (!r.ok) return
        const j = await r.json()
        if (!cancelled) setData(j.data ?? null)
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug])

  if (!data || !slug) return <Spinner />
  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="flex flex-col gap-5">
        <ProfileCard data={data} lang={lang} onClose={onClose} />
        {/* Avatar/post tıklaması ayrı OS penceresi açmaz → bu widget alanında
            stack (push/pop). */}
        <CompanyFeedStack
          lang={lang}
          slug={slug}
          viewer={{ id: user.id, name: user.name ?? null, image: user.image ?? null }}
        />
      </div>
    </div>
  )
}

// ── Profile (user public profile) ────────────────────────────────────────────
function ProfileView({ lang, onClose }: { lang: string; onClose: () => void }) {
  const t = useTranslations("os")
  const openSettings = useOsStore((s) => s.openSettings)
  // undefined = yükleniyor, null = public slug yok
  const [slug, setSlug] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch("/api/user/profile")
        const j = await r.json()
        if (!cancelled) setSlug((j?.data?.profileSlug as string | null) ?? null)
      } catch {
        if (!cancelled) setSlug(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (slug === undefined) return <Spinner />
  if (!slug) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <p className="text-sm text-muted-foreground">{t("noPublicProfile")}</p>
        <Button
          size="sm"
          onClick={() => {
            openSettings("profile")
            onClose()
          }}
        >
          {t("systemSettings")}
        </Button>
      </div>
    )
  }
  return (
    <iframe
      src={`/${lang}/profile/u/${slug}?embed=1`}
      title="Profile"
      className="size-full border-0 bg-background"
      allow="clipboard-write; clipboard-read"
    />
  )
}

/** Widget profil kartı — isim altında üye sayısı + OS-içi "Open profile"
 *  (pencerede açılır) ve "Manage" (System Settings → Company) aksiyonları. */
function ProfileCard({ data, onClose }: { data: CompanyData; lang: string; onClose: () => void }) {
  const tp = useTranslations("companyProfile")
  const openSettings = useOsStore((s) => s.openSettings)
  const canManage = data.membership?.role === "owner" || data.membership?.role === "admin"

  function manage() {
    openSettings("company")
    onClose()
  }

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      {data.coverImageUrl ? (
        <div className="h-20 bg-cover bg-center" style={{ backgroundImage: `url(${data.coverImageUrl})` }} />
      ) : (
        <div className="h-16 bg-gradient-to-br from-primary/25 to-primary/5" />
      )}
      <div className="px-4 pb-4">
        <div className="flex items-end gap-3">
          <CompanyAvatar
            name={data.name}
            avatarUrl={data.avatarUrl ?? null}
            size="2xl"
            rounded="lg"
            className="relative z-10 -mt-8 ring-4 ring-card"
          />
          <div className="min-w-0 pb-1">
            <h2 className="truncate text-lg font-semibold leading-tight">{data.name}</h2>
            <p className="truncate font-mono text-xs text-muted-foreground">/profile/c/{data.slug}</p>
          </div>
        </div>

        {data.description ? (
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{data.description}</p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 text-xs">
            <HugeiconsIcon icon={UserMultipleIcon} strokeWidth={2} className="size-3.5" />
            {tp("memberCount", { count: data.memberCount ?? 0 })}
          </span>
          {canManage ? (
            <Button type="button" variant="ghost" size="sm" onClick={manage} className="gap-1.5">
              <HugeiconsIcon icon={Settings02Icon} strokeWidth={2} className="size-3.5" />
              {tp("manage")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
