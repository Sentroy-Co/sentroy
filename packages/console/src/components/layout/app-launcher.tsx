"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { motion } from "framer-motion"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  GridViewIcon,
  Mail01Icon,
  FolderLibraryIcon,
  KeyIcon,
  ShieldUserIcon,
  ShieldKeyIcon,
  ChartBarLineIcon,
  HeadphonesIcon,
  FilmRoll01Icon,
  CheckmarkCircle02Icon,
  Message01Icon,
  Wrench01Icon,
  KanbanIcon,
  Video01Icon,
  Database01Icon,
} from "@hugeicons/core-free-icons"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@workspace/ui/components/dialog"
import { Button } from "@workspace/ui/components/button"
import { useNotificationsStore } from "@workspace/console/stores/notifications"
import { cn } from "@workspace/ui/lib/utils"
import {
  clientRootDomain,
  rootOrigin,
  subAppOrigin,
} from "@workspace/auth/lib/domains"

/**
 * Sentroy app launcher — header button → grid picker.
 *
 * Grid pattern: tüm Sentroy app'leri eşit boyutlu kartlar olarak sergilenir;
 * tıklama doğrudan navigation tetikler (cross-subdomain full nav). Aktif
 * app belirgin bir ring + "Current" rozeti ile işaretlenir ama yine de
 * tıklanabilir (aynı app'i yeniden açmak yenilenmiş bir oturum sağlar).
 *
 * Önceki "wheel" tasarımındaki iki-tık modeli (önce surface, sonra open)
 * kaldırıldı — kullanıcı geri bildirimi: list-rotate UX şık değil + iki
 * tık gereksiz.
 *
 * Keyboard: ← → ↑ ↓ focus taşır, Enter navigate, Esc close.
 *
 * Counter integration: her app descriptor opsiyonel `count` taşır
 * (mail.unreadInbox gibi). Kart sağ üstte glow'lu pill badge gösterilir.
 *
 * Brand color: kart hover'da gradient halo, aktif kartta ring rengi.
 */

export interface AppDescriptor {
  id: string
  /** Display name */
  name: string
  /** One-line description (i18n) */
  description: string
  /** CTA button label on active card (i18n) */
  cta: string
  /** Hugeicons SvgObject — typed as SvgObject from icons lib */
  icon: typeof Mail01Icon
  /** Brand accent — hex */
  color: string
  /** Absolute (cross-subdomain) or relative (same-origin) URL */
  href: string
  /** Optional notification badge value (e.g. unread count) */
  count?: number
  /**
   * Store app'leri (3. parti) için marka logosu URL'i. Verilirse ikon yerine
   * (img onError fallback ile) gösterilir — dış app'ler Hugeicons JS objesi
   * sağlayamaz. `icon` yine zorunlu (logo yüklenemezse fallback).
   */
  logoUrl?: string
  /** "store" → Sentroy App Store uygulaması (sandbox'lı iframe + embed token). */
  kind?: "first-party" | "store"
  /** Store app embed config — SERVER'da hesaplanan güvenlik değerleri. */
  embed?: {
    /** Manifest identity.id — embed token mint için. */
    appId: string
    sandbox: string
    allow: string
    injectedParams: string[]
    authMode: "none" | "token" | "oauth"
    companySlug: string
    supportedLangs: string[]
    fallbackLang: string
    minHeight?: number | null
  }
}

export interface AppLauncherProps {
  apps: AppDescriptor[]
  /** id of the app currently open in this dashboard — pre-selects + visually
   *  indicated. */
  currentAppId?: string
  /** Header trigger label (sr-only). i18n caller'ın sorumluluğu. */
  triggerLabel?: string
  /** Trigger button class — header'da boyut ayarlamak için. */
  className?: string
}

export function AppLauncher({
  apps,
  currentAppId,
  triggerLabel = "Open app launcher",
  className,
}: AppLauncherProps) {
  const [open, setOpen] = useState(false)

  if (apps.length === 0) return null

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={triggerLabel}
        data-app-launcher
        className={cn("relative", className)}
        onClick={() => setOpen(true)}
      >
        <HugeiconsIcon icon={GridViewIcon} strokeWidth={2} />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-2xl p-0 overflow-hidden gap-0 border-border/60 bg-background/95 backdrop-blur-xl"
        >
          <DialogTitle className="sr-only">App launcher</DialogTitle>
          <DialogDescription className="sr-only">
            Switch between Sentroy apps.
          </DialogDescription>
          <AppLauncherGrid
            apps={apps}
            currentAppId={currentAppId}
            onClose={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── Grid ──────────────────────────────────────────────────────────────────

function AppLauncherGrid({
  apps,
  currentAppId,
  onClose,
}: {
  apps: AppDescriptor[]
  currentAppId?: string
  onClose: () => void
}) {
  const initialIdx = useMemo(() => {
    if (currentAppId) {
      const idx = apps.findIndex((a) => a.id === currentAppId)
      if (idx >= 0) return idx
    }
    return 0
  }, [apps, currentAppId])

  const [focusIdx, setFocusIdx] = useState(initialIdx)
  const gridRef = useRef<HTMLDivElement>(null)

  // Focus initial card on open
  useEffect(() => {
    const el = gridRef.current?.querySelector<HTMLButtonElement>(
      `[data-app-idx="${initialIdx}"]`,
    )
    el?.focus()
  }, [initialIdx])

  const navigate = useCallback(
    (idx: number) => {
      const target = apps[idx]
      if (!target) return
      // Aktif app'e tıklamak hard reload yapmak yerine sadece dialog kapatır
      // — Google waffle / M365 / Atlassian switcher pattern. Aksi halde kullanıcı
      // "neden refresh oldu?" diye düşünür.
      if (target.id === currentAppId) {
        onClose()
        return
      }
      onClose()
      // Dialog close anim'inin başlaması için kısa gecikme — premium feel.
      setTimeout(() => {
        window.location.href = target.href
      }, 60)
    },
    [apps, currentAppId, onClose],
  )

  // Responsive col count — sm:grid-cols-2 + md:grid-cols-3. Keyboard
  // navigation arrow keys grid layout'a göre +/- 1 (yatay) ve +/- cols
  // (dikey) hareket eder. Cols runtime'da window.innerWidth ile sniff —
  // basit ama yeterli (Dialog max-w-2xl, breakpoint'ler fix).
  const cols = useResponsiveCols()

  const handleKey = useCallback(
    (e: React.KeyboardEvent) => {
      const n = apps.length
      if (n === 0) return
      let next = focusIdx
      if (e.key === "ArrowRight") next = (focusIdx + 1) % n
      else if (e.key === "ArrowLeft") next = (focusIdx - 1 + n) % n
      else if (e.key === "ArrowDown") next = Math.min(focusIdx + cols, n - 1)
      else if (e.key === "ArrowUp") next = Math.max(focusIdx - cols, 0)
      else if (e.key === "Enter") {
        e.preventDefault()
        navigate(focusIdx)
        return
      } else return
      e.preventDefault()
      setFocusIdx(next)
      const el = gridRef.current?.querySelector<HTMLButtonElement>(
        `[data-app-idx="${next}"]`,
      )
      el?.focus()
    },
    [focusIdx, apps.length, cols, navigate],
  )

  return (
    <div className="flex flex-col">
      {/* Header — brand line + keyboard hint */}
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
        <div className="flex items-center gap-2">
          <HugeiconsIcon
            icon={GridViewIcon}
            strokeWidth={2}
            className="size-3.5 text-muted-foreground"
          />
          <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
            Sentroy app switcher
          </span>
        </div>
        <span className="hidden sm:block text-[10px] font-mono text-muted-foreground/70">
          ← → ↑ ↓ navigate · ⏎ open · esc close
        </span>
      </div>

      {/* Grid — role=grid kullanmıyoruz çünkü ARIA grid pattern row/gridcell
          descendant ister; button'larımız zaten kendi semantiğini taşıyor
          (Google waffle pattern). Sadece aria-label tutuyoruz. */}
      <div
        ref={gridRef}
        onKeyDown={handleKey}
        className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3"
        aria-label="Sentroy apps"
      >
        {apps.map((app, idx) => {
          const isCurrent = app.id === currentAppId
          return (
            <AppTile
              key={app.id}
              app={app}
              idx={idx}
              isCurrent={isCurrent}
              isFocused={focusIdx === idx}
              onClick={() => navigate(idx)}
            />
          )
        })}
      </div>

      {/* Footer hint — subtle, only on mobile (sm hint is in header) */}
      <div className="border-t border-border/60 bg-muted/20 px-5 py-2 sm:hidden">
        <span className="text-[10px] font-mono text-muted-foreground/70">
          Tap to open · esc to close
        </span>
      </div>
    </div>
  )
}

// ─── Tile ──────────────────────────────────────────────────────────────────

function AppTile({
  app,
  idx,
  isCurrent,
  isFocused,
  onClick,
}: {
  app: AppDescriptor
  idx: number
  isCurrent: boolean
  isFocused: boolean
  onClick: () => void
}) {
  return (
    <motion.button
      type="button"
      data-app-idx={idx}
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 380, damping: 26 }}
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      style={
        {
          // CSS custom prop — hover halo (radial gradient) + active ring color
          // ikisi de aynı --app-tile-color'ı okur. Tailwind arbitrary values
          // CSS var'ı yorumlar (v4 ile destekli). Inline DOM mutation yok.
          "--app-tile-color": app.color,
        } as React.CSSProperties
      }
      className={cn(
        "group relative flex aspect-square flex-col items-start justify-between overflow-hidden rounded-xl border p-3 text-left",
        "outline-none transition-all duration-200",
        isCurrent
          ? "border-transparent bg-card ring-2 ring-offset-1 ring-offset-background ring-[var(--app-tile-color)]"
          : "border-border/60 bg-card hover:border-border focus-visible:border-border",
        "hover:shadow-[0_8px_30px_-12px_var(--app-tile-color)]",
        "focus-visible:shadow-[0_8px_30px_-12px_var(--app-tile-color)]",
      )}
      aria-current={isCurrent ? "page" : undefined}
      aria-label={`${app.name}${isCurrent ? " (current)" : ""}${
        typeof app.count === "number" && app.count > 0
          ? ` · ${app.count} unread`
          : ""
      }`}
      tabIndex={isFocused ? 0 : -1}
    >
      {/* Hover halo — colored radial gradient revealed on hover */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100"
        style={{
          background: `radial-gradient(120% 80% at 0% 0%, ${app.color}1a 0%, transparent 60%)`,
        }}
      />

      {/* Top row — icon tile + (count badge OR current pill) */}
      <div className="relative z-10 flex w-full items-start justify-between">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-110"
          style={{
            background: `${app.color}1a`,
            color: app.color,
          }}
        >
          <HugeiconsIcon
            icon={app.icon}
            strokeWidth={2}
            className="size-5"
          />
        </div>
        {isCurrent ? (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
            style={{
              background: `${app.color}1f`,
              color: app.color,
            }}
          >
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              strokeWidth={2.5}
              className="size-3"
            />
            Current
          </span>
        ) : typeof app.count === "number" && app.count > 0 ? (
          <span
            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold leading-none text-white shadow-md"
            style={{ background: app.color }}
          >
            {app.count > 99 ? "99+" : app.count}
          </span>
        ) : null}
      </div>

      {/* Bottom row — name + description */}
      <div className="relative z-10 mt-auto w-full">
        <h3 className="truncate text-sm font-semibold text-foreground">
          {app.name}
        </h3>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-tight text-muted-foreground">
          {app.description}
        </p>
      </div>
    </motion.button>
  )
}

// ─── Responsive cols hook — for keyboard navigation grid math ─────────────

function useResponsiveCols(): number {
  // Dialog content uses grid-cols-2 < sm < grid-cols-3. Match Tailwind sm: 640px.
  // Lazy initializer — Dialog sadece client'ta mount olduğu için window
  // her zaman tanımlı; ilk paint'te doğru col sayısı gelir, ilk arrow-key
  // press hatalı atlama yapmaz.
  const [cols, setCols] = useState(() => {
    if (typeof window === "undefined") return 3
    return window.matchMedia("(min-width: 640px)").matches ? 3 : 2
  })
  useEffect(() => {
    if (typeof window === "undefined") return
    const mq = window.matchMedia("(min-width: 640px)")
    const update = () => setCols(mq.matches ? 3 : 2)
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])
  return cols
}

// ─── Server-friendly wrapper ──────────────────────────────────────────────

/**
 * Drop-in `<DashboardAppLauncher currentAppId="mail" />` — server
 * component layout'larından kullanılacak. İçeride `useParams` +
 * `useSentroyApps` hook'larını çağırıp `<AppLauncher>`'a forward eder.
 *
 * Permissions opsiyonel; verilmezse tüm app'ler gösterilir. Verildiğinde
 * `false` olan app'ler listeden düşer.
 */
export function DashboardAppLauncher({
  currentAppId,
  permissions,
}: {
  currentAppId?: string
  permissions?: UseSentroyAppsOptions["permissions"]
}) {
  return (
    <DashboardAppLauncherInner
      currentAppId={currentAppId}
      permissions={permissions}
    />
  )
}

function DashboardAppLauncherInner({
  currentAppId,
  permissions,
}: {
  currentAppId?: string
  permissions?: UseSentroyAppsOptions["permissions"]
}) {
  const params = useParams<{ lang?: string; "company-slug"?: string }>()
  const lang = params?.lang || "en"
  const companySlug = params?.["company-slug"] || ""
  const apps = useSentroyApps({ lang, companySlug, permissions })

  if (!companySlug) return null
  return <AppLauncher apps={apps} currentAppId={currentAppId} />
}

// ─── Convenience helper — standard Sentroy app list ───────────────────────

export interface UseSentroyAppsOptions {
  lang: string
  companySlug: string
  /** Permissions to filter apps; if undefined all apps are shown. */
  permissions?: {
    canMail?: boolean
    canStorage?: boolean
    canVault?: boolean
    canAuth?: boolean
    canStatus?: boolean
    canStudio?: boolean
    canWhatsapp?: boolean
    canLinear?: boolean
    canOpencut?: boolean
    /** MongoDB Backuper — opt-in (App Store'dan kurulur; default gelmez). */
    canBackup?: boolean
    canMeet?: boolean
    isAdmin?: boolean
  }
}

/**
 * Standart Sentroy app listesi — translation key'lerini `appPicker.*`
 * namespace'inden çeker, env URL'lerini hesaplar, mail için inbox
 * unread counter'ını otomatik bağlar. Caller `<AppLauncher apps={apps}/>`
 * şeklinde mount eder.
 *
 * Permissions opsiyonel — verilmemiş app her zaman gösterilir; verilen
 * `false` app listeden düşer (örn. user mail'e yetkisi yoksa Mail
 * görünmez).
 */
export function useSentroyApps({
  lang,
  companySlug,
  permissions,
}: UseSentroyAppsOptions): AppDescriptor[] {
  const t = useTranslations("appPicker")
  const inboxCount = useNotificationsStore((s) => s.inboxUnreadCount)

  return useMemo(() => {
    // Per-app NEXT_PUBLIC_*_APP_URL override edilebilir; verilmezse tek
    // NEXT_PUBLIC_ROOT_DOMAIN'den türetilir (default sentroy.com → mevcut
    // URL'lerle BİREBİR aynı). Self-host: tek env → tüm app switcher taşınır.
    const root = clientRootDomain()
    const coreUrl = process.env.NEXT_PUBLIC_CORE_APP_URL || rootOrigin(root)
    const mailUrl =
      process.env.NEXT_PUBLIC_MAIL_APP_URL || subAppOrigin(root, "mail")
    const storageUrl =
      process.env.NEXT_PUBLIC_STORAGE_APP_URL || subAppOrigin(root, "storage")
    const vaultUrl =
      process.env.NEXT_PUBLIC_VAULT_APP_URL || subAppOrigin(root, "vault")
    const authUrl =
      process.env.NEXT_PUBLIC_AUTH_APP_URL || subAppOrigin(root, "auth")
    const statusUrl =
      process.env.NEXT_PUBLIC_STATUS_APP_URL || subAppOrigin(root, "status")
    const studioUrl =
      process.env.NEXT_PUBLIC_STUDIO_APP_URL || subAppOrigin(root, "studio")
    const whatsappUrl =
      process.env.NEXT_PUBLIC_WHATSAPP_APP_URL || subAppOrigin(root, "whatsapp")
    const linearUrl =
      process.env.NEXT_PUBLIC_LINEAR_APP_URL || subAppOrigin(root, "linear")
    const opencutUrl =
      process.env.NEXT_PUBLIC_OPENCUT_APP_URL || subAppOrigin(root, "opencut")
    const meetUrl =
      process.env.NEXT_PUBLIC_MEET_APP_URL || subAppOrigin(root, "meet")
    const toolsUrl =
      process.env.NEXT_PUBLIC_TOOLS_APP_URL || subAppOrigin(root, "tools")
    const backupUrl =
      process.env.NEXT_PUBLIC_BACKUP_APP_URL || subAppOrigin(root, "backup")

    const dashPath = `/${lang}/d/${companySlug}`
    const all: (AppDescriptor & { permitted?: boolean })[] = [
      {
        id: "core",
        name: "Sentroy",
        description: "Company overview, posts, settings, members.",
        cta: "Open Sentroy",
        icon: ShieldKeyIcon,
        color: "#111111",
        href: `${coreUrl}${dashPath}`,
        permitted: true,
      },
      {
        id: "mail",
        name: t("mail.name"),
        description: t("mail.description"),
        cta: t("mail.cta"),
        icon: Mail01Icon,
        color: "#3b82f6", // blue-500
        href: `${mailUrl}${dashPath}`,
        count: inboxCount,
        permitted: permissions?.canMail ?? true,
      },
      {
        id: "storage",
        name: t("storage.name"),
        description: t("storage.description"),
        cta: t("storage.cta"),
        icon: FolderLibraryIcon,
        color: "#a855f7", // purple-500
        href: `${storageUrl}${dashPath}`,
        permitted: permissions?.canStorage ?? true,
      },
      {
        id: "vault",
        name: t("vault.name"),
        description: t("vault.description"),
        cta: t("vault.cta"),
        icon: KeyIcon,
        color: "#f59e0b", // amber-500
        href: `${vaultUrl}${dashPath}`,
        permitted: permissions?.canVault ?? true,
      },
      {
        id: "auth",
        name: t("auth.name"),
        description: t("auth.description"),
        cta: t("auth.cta"),
        icon: ShieldUserIcon,
        color: "#10b981", // emerald-500
        href: `${authUrl}${dashPath}`,
        permitted: permissions?.canAuth ?? true,
      },
      {
        id: "status",
        name: t("status.name"),
        description: t("status.description"),
        cta: t("status.cta"),
        icon: ChartBarLineIcon,
        color: "#06b6d4", // cyan-500
        href: `${statusUrl}${dashPath}/status`,
        permitted: permissions?.canStatus ?? true,
      },
      {
        id: "studio",
        name: t("studio.name"),
        description: t("studio.description"),
        cta: t("studio.cta"),
        icon: HeadphonesIcon,
        color: "#ec4899", // pink-500
        href: `${studioUrl}${dashPath}/studio`,
        permitted: permissions?.canStudio ?? true,
      },
      {
        id: "whatsapp",
        name: t("whatsapp.name"),
        description: t("whatsapp.description"),
        cta: t("whatsapp.cta"),
        icon: Message01Icon,
        color: "#25d366", // WhatsApp green
        // Base dashboard (overview). OS window app: AppSectionPanel appends
        // section slugs (/chats, /templates, …). Non-OS grid → overview page.
        href: `${whatsappUrl}${dashPath}`,
        permitted: permissions?.canWhatsapp ?? true,
      },
      {
        id: "linear",
        name: t("linear.name"),
        description: t("linear.description"),
        cta: t("linear.cta"),
        icon: KanbanIcon,
        color: "#5E6AD2", // Linear brand indigo
        href: `${linearUrl}${dashPath}`,
        permitted: permissions?.canLinear ?? true,
      },
      {
        id: "opencut",
        name: t("opencut.name"),
        description: t("opencut.description"),
        cta: t("opencut.cta"),
        icon: FilmRoll01Icon,
        color: "#f97316", // orange-500
        // OpenCut self-hosted (opencut.sentroy.com). Cross-subdomain `.sentroy.com`
        // session paylaşıldığından OS iframe'inde ayrı login gerekmez; doğrudan
        // proje workspace'ine git (landing değil).
        href: `${opencutUrl}/projects`,
        permitted: permissions?.canOpencut ?? true,
      },
      {
        id: "meet",
        name: t("meet.name"),
        description: t("meet.description"),
        cta: t("meet.cta"),
        icon: Video01Icon,
        color: "#0ea5e9", // sky-500
        // Sentroy Meet (meet.sentroy.com) — white-label Jitsi + kendi kabuk.
        // Cross-subdomain `.sentroy.com` session'ıyla kimlik alınır; lobi kök
        // URL'de (yeni toplantı / linkle katıl). Plain iframe (OpenCut deseni).
        href: meetUrl,
        permitted: permissions?.canMeet ?? true,
      },
      {
        id: "tools",
        name: "Tools",
        description: "Free image, PDF, audio, video & developer tools.",
        cta: "Open Tools",
        icon: Wrench01Icon,
        color: "#6366f1", // indigo-500 (tools teması)
        // Public araçlar — company dashPath yok, host root'una git (OpenCut deseni).
        href: toolsUrl,
        permitted: true,
      },
      {
        id: "backup",
        name: "MongoDB Backup",
        description: "Back up, restore across servers, and download MongoDB dumps.",
        cta: "Open Backup",
        icon: Database01Icon,
        color: "#13aa52", // MongoDB green
        href: `${backupUrl}${dashPath}`,
        // Opt-in (App Store'dan kurulur) → default gelmez. sentroy-os gerçek
        // install state'ini canBackup ile geçer; kurulmadıkça görünmez.
        permitted: permissions?.canBackup ?? false,
      },
    ]

    if (permissions?.isAdmin) {
      all.push({
        id: "admin",
        name: t("admin.name"),
        description: t("admin.description"),
        cta: t("admin.cta"),
        icon: ShieldKeyIcon,
        color: "#dc2626", // red-600
        href: `${coreUrl}/${lang}/admin`,
        permitted: true,
      })
    }

    // Özel PNG app ikonları (core/public/os-app-icons/<id>.webp; 256px). Yalnız
    // ikonu olan app'lere logoUrl eklenir — admin/core hugeicons glyph'inde
    // kalır. logoUrl core-mutlak: launcher grid'i mail/storage subdomain'lerinde
    // de render olabildiğinden relative yol 404 verirdi.
    const iconApps = new Set([
      "mail", "storage", "vault", "auth", "status",
      "studio", "whatsapp", "linear", "opencut", "meet", "tools", "backup",
    ])
    return all
      .filter((a) => a.permitted)
      .map(({ permitted: _p, ...rest }) =>
        iconApps.has(rest.id)
          ? { ...rest, logoUrl: `${coreUrl}/os-app-icons/${rest.id}.webp` }
          : rest,
      )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    lang,
    companySlug,
    inboxCount,
    permissions?.canMail,
    permissions?.canStorage,
    permissions?.canVault,
    permissions?.canAuth,
    permissions?.canStatus,
    permissions?.canStudio,
    permissions?.canWhatsapp,
    permissions?.canLinear,
    permissions?.canOpencut,
    permissions?.canMeet,
    permissions?.canBackup,
    permissions?.isAdmin,
    t,
  ])
}
