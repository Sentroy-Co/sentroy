"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { motion } from "framer-motion"
import { HugeiconsIcon } from "@hugeicons/react"
import { UserCircleIcon, Settings02Icon, CreditCardIcon, UserMultipleIcon, LockKeyIcon } from "@hugeicons/core-free-icons"
import type { OsUser } from "./menu-bar"
import { useWindowGeometry, RESIZE_HANDLES, MIN_H, type Geo } from "./use-window-geometry"
import { CompanyPane } from "./settings/company-pane"
import { BillingPane } from "./settings/billing-pane"
import { ProfilePane } from "./settings/profile-pane"

const DOCK_CLEARANCE = 92

const CATEGORIES = [
  { id: "profile", name: "Profile", icon: UserCircleIcon, color: "#0a84ff" },
  { id: "company", name: "Company", icon: Settings02Icon, color: "#8e8e93" },
  { id: "team", name: "Team", icon: UserMultipleIcon, color: "#6366f1" },
  { id: "access-tokens", name: "Access Tokens", icon: LockKeyIcon, color: "#7c3aed" },
  { id: "billing", name: "Billing", icon: CreditCardIcon, color: "#30d158" },
] as const

/**
 * macOS System Settings tarzı kayan pencere — sürüklenebilir + resize edilebilir
 * (app pencereleriyle aynı geometry hook'u). Sol kategori kenar çubuğu
 * (Apple-ID kartı + Profile/Company/Billing), sağ NATIVE pane. Modal değil:
 * arka plan tıklanabilir kalır. Tamamen select-none (app hissi).
 */
export function SettingsWindow({
  lang,
  companySlug,
  user,
  initialCategory,
  onClose,
  onCompanyDeleted,
}: {
  lang: string
  companySlug: string
  user: OsUser
  initialCategory: string
  onClose: () => void
  onCompanyDeleted: () => void
}) {
  const t = useTranslations("os")
  const [active, setActive] = useState(() =>
    CATEGORIES.some((c) => c.id === initialCategory) ? initialCategory : CATEGORIES[0].id,
  )
  const [maximized, setMaximized] = useState(false)
  const [stored, setStored] = useState<Geo | null>(null)

  const ref = useRef<HTMLDivElement>(null)
  const [bounds, setBounds] = useState({ w: 1280, h: 720 })
  useEffect(() => {
    const measure = () => {
      const el = ref.current
      if (el) setBounds({ w: el.clientWidth, h: el.clientHeight })
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const W = Math.min(880, bounds.w - 40)
  const H = Math.min(600, bounds.h - 40)
  const centered: Geo = { x: Math.max(0, (bounds.w - W) / 2), y: Math.max(0, (bounds.h - H) / 2), w: W, h: H }
  const { geo, startDrag, startResize } = useWindowGeometry({
    base: stored ?? centered,
    bounds,
    locked: maximized,
    onCommit: setStored,
  })
  const display: Geo = maximized
    ? { x: 0, y: 0, w: bounds.w, h: Math.max(MIN_H, bounds.h - DOCK_CLEARANCE) }
    : geo

  const activeCat = CATEGORIES.find((c) => c.id === active) ?? CATEGORIES[0]

  return (
    <div ref={ref} className="pointer-events-none fixed inset-x-0 bottom-0 top-10 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 340, damping: 30 }}
        style={{ left: display.x, top: display.y, width: display.w, height: display.h }}
        className="pointer-events-auto absolute flex select-none flex-col overflow-hidden rounded-2xl bg-background shadow-[0_28px_80px_-12px_rgba(0,0,0,0.6)] ring-1 ring-black/15 dark:ring-white/15"
      >
        {/* Başlık çubuğu */}
        <div
          onPointerDown={startDrag}
          onDoubleClick={() => setMaximized((m) => !m)}
          className="flex h-11 shrink-0 cursor-grab items-center gap-2 border-b border-border/60 bg-muted/40 px-4 active:cursor-grabbing"
        >
          <div className="group/lights flex items-center gap-2" onPointerDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex size-3 items-center justify-center rounded-full bg-[#ff5f57] ring-1 ring-black/10"
            >
              <span className="text-[9px] font-bold leading-none text-black/55 opacity-0 group-hover/lights:opacity-100">×</span>
            </button>
            <span className="size-3 rounded-full bg-[#febc2e] ring-1 ring-black/10" />
            <button
              type="button"
              onClick={() => setMaximized((m) => !m)}
              aria-label="Zoom"
              className="flex size-3 items-center justify-center rounded-full bg-[#28c840] ring-1 ring-black/10"
            >
              <span className="text-[9px] font-bold leading-none text-black/55 opacity-0 group-hover/lights:opacity-100">+</span>
            </button>
          </div>
          <span className="ml-2 text-sm font-medium text-foreground/80">{t(`settings.${activeCat.id}`)}</span>
        </div>

        {/* Gövde */}
        <div className="flex min-h-0 flex-1">
          <aside className="os-scrollbar flex w-52 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border/60 bg-muted/30 p-3">
            <div className="mb-2 flex items-center gap-3 rounded-xl p-2">
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.image} alt="" className="size-11 rounded-full object-cover" />
              ) : (
                <span className="flex size-11 items-center justify-center rounded-full bg-primary text-base font-medium text-primary-foreground">
                  {(user.name || user.email).charAt(0).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{user.name || t("account")}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              </div>
            </div>

            {CATEGORIES.map((c) => {
              const isActive = c.id === active
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActive(c.id)}
                  className={
                    "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm outline-none transition-colors " +
                    (isActive ? "bg-[#0a84ff] text-white" : "text-foreground hover:bg-foreground/5")
                  }
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md text-white shadow-sm" style={{ background: c.color }}>
                    <HugeiconsIcon icon={c.icon} className="size-4" strokeWidth={2} />
                  </span>
                  <span className="truncate">{t(`settings.${c.id}`)}</span>
                </button>
              )
            })}
          </aside>

          <div className="min-h-0 min-w-0 flex-1">
            {/* Profile/Company/Billing = NATIVE pane; Team/Access Tokens embed. */}
            {active === "profile" ? <ProfilePane lang={lang} user={user} /> : null}
            {active === "company" ? <CompanyPane lang={lang} slug={companySlug} onDeleted={onCompanyDeleted} /> : null}
            {active === "team" ? <SettingsFrame src={`/${lang}/d/${companySlug}/team?embed=1`} title="Team" /> : null}
            {active === "access-tokens" ? <SettingsFrame src={`/${lang}/d/${companySlug}/access-tokens?embed=1`} title="Access Tokens" /> : null}
            {active === "billing" ? <BillingPane lang={lang} slug={companySlug} /> : null}
          </div>
        </div>

        {/* resize tutamakları */}
        {maximized
          ? null
          : RESIZE_HANDLES.map((h) => (
              <div key={h.dir} onPointerDown={(e) => startResize(e, h.dir)} className={"absolute z-20 " + h.className} />
            ))}
      </motion.div>
    </div>
  )
}

/** Settings içi embed iframe pane (yükleme spinner'lı). */
function SettingsFrame({ src, title }: { src: string; title: string }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <div className="relative size-full bg-background">
      <iframe
        src={src}
        title={title}
        className="size-full border-0 bg-background"
        onLoad={() => setLoaded(true)}
        allow="clipboard-write; clipboard-read"
      />
      {!loaded ? (
        <div className="absolute inset-0 flex items-center justify-center bg-background">
          <span className="size-7 animate-spin rounded-full border-2 border-muted border-t-[#0a84ff]" />
        </div>
      ) : null}
    </div>
  )
}
