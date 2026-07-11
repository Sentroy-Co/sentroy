"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { AppDescriptor } from "@workspace/console/components/layout/app-launcher"
import { useOsStore } from "./os-store"
import { WindowFrame } from "./window-frame"
import { Launchpad } from "./tools/launchpad"
import { LaunchpadApps } from "./launchpad-apps"
import { AdminPanel } from "./admin/admin-panel"
import { StorePanel } from "./store/store-panel"
import { AppSectionPanel } from "./app-section-panel"
import { MAIL_SECTIONS, STORAGE_SECTIONS, AUTH_SECTIONS, WHATSAPP_SECTIONS, LINEAR_SECTIONS, STATUS_SECTIONS } from "./app-sections"
import { NotesApp } from "./notes/notes-app"
import { AchievementsApp } from "./achievements/achievements-app"

/**
 * Masaüstü pencere alanı — menü barın altını doldurur. Açık (loaded)
 * pencereleri WindowFrame olarak render eder; minimize olanlar mount kalır
 * ama gizlenir (iframe state korunur). "tools" penceresi native Launchpad
 * gösterir; oradan açılan araçlar dinamik app penceresi (iframe) olur.
 */
export function WindowManager({
  apps,
  storeApps = [],
  lang,
  isAdmin,
  companySlug,
}: {
  apps: AppDescriptor[]
  /** Kurulu App Store uygulamaları — Launchpad "Your apps" bölümü. */
  storeApps?: AppDescriptor[]
  lang: string
  isAdmin: boolean
  companySlug: string
}) {
  const windows = useOsStore((s) => s.windows)
  const activeId = useOsStore((s) => s.activeId)
  const activeSpace = useOsStore((s) => s.activeSpace)
  const dynamicApps = useOsStore((s) => s.dynamicApps)
  const openApp = useOsStore((s) => s.openApp)
  const focusWindow = useOsStore((s) => s.focusWindow)
  const closeWindow = useOsStore((s) => s.closeWindow)
  const minimizeWindow = useOsStore((s) => s.minimizeWindow)
  const toggleMaximize = useOsStore((s) => s.toggleMaximize)
  const toggleFullscreen = useOsStore((s) => s.toggleFullscreen)
  const setGeometry = useOsStore((s) => s.setGeometry)

  const openDescriptor = useCallback((d: AppDescriptor) => openApp(d.id, d), [openApp])

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
    // activeSpace değişince container geometrisi değişir (inset-0 ↔ top-10) →
    // yeniden ölç (fullscreen pencere tam viewport'u kaplasın).
  }, [activeSpace])

  return (
    <div
      ref={ref}
      className={
        activeSpace
          ? "pointer-events-none absolute inset-0 z-50"
          : "pointer-events-none absolute inset-x-0 bottom-0 top-10 z-10 isolate"
      }
    >
      {windows
        .filter((w) => w.loaded)
        .map((w) => {
          const app = apps.find((a) => a.id === w.appId) ?? dynamicApps[w.appId]
          if (!app) return null
          // Spaces görünürlük: bir space aktifse yalnız o pencere görünür;
          // değilse fullscreen pencereler (kendi space'inde) + minimize'lar gizli.
          const hidden = activeSpace ? w.appId !== activeSpace : w.minimized || w.fullscreen
          return (
            <WindowFrame
              key={w.appId}
              win={w}
              app={app}
              bounds={bounds}
              active={activeId === w.appId}
              hidden={hidden}
              lang={lang}
              onFocus={() => focusWindow(w.appId)}
              onClose={() => closeWindow(w.appId)}
              onMinimize={() => minimizeWindow(w.appId)}
              onToggleMax={() => toggleMaximize(w.appId)}
              onToggleFullscreen={() => toggleFullscreen(w.appId)}
              onGeometry={(g) => setGeometry(w.appId, g)}
            >
              {w.appId === "tools" ? (
                <Launchpad lang={lang} onOpen={openDescriptor} storeApps={storeApps} />
              ) : w.appId === "launchpad" ? (
                <LaunchpadApps
                  apps={apps}
                  storeApps={storeApps}
                  onOpen={openDescriptor}
                  onClose={() => closeWindow("launchpad")}
                />
              ) : w.appId === "store" ? (
                <StorePanel lang={lang} companySlug={companySlug} />
              ) : w.appId === "admin" ? (
                <AdminPanel lang={lang} />
              ) : w.appId === "notes" ? (
                <NotesApp lang={lang} slug={companySlug} />
              ) : w.appId === "achievements" ? (
                <AchievementsApp slug={companySlug} availableAppIds={apps.map((a) => a.id)} />
              ) : w.appId === "mail" ? (
                <AppSectionPanel
                  lang={lang}
                  slug={companySlug}
                  appHref={app.href}
                  isAdmin={isAdmin}
                  sections={MAIL_SECTIONS}
                  accentIcon={app.icon}
                  accentColor={app.color}
                  title={app.name}
                  domainStatusUrl={`/api/mail/companies/${companySlug}/domains`}
                />
              ) : w.appId === "storage" ? (
                <AppSectionPanel
                  lang={lang}
                  slug={companySlug}
                  appHref={app.href}
                  isAdmin={isAdmin}
                  sections={STORAGE_SECTIONS}
                  accentIcon={app.icon}
                  accentColor={app.color}
                  title={app.name}
                />
              ) : w.appId === "auth" ? (
                <AppSectionPanel
                  lang={lang}
                  slug={companySlug}
                  appHref={app.href}
                  isAdmin={isAdmin}
                  sections={AUTH_SECTIONS}
                  accentIcon={app.icon}
                  accentColor={app.color}
                  title={app.name}
                />
              ) : w.appId === "whatsapp" ? (
                <AppSectionPanel
                  lang={lang}
                  slug={companySlug}
                  appHref={app.href}
                  isAdmin={isAdmin}
                  sections={WHATSAPP_SECTIONS}
                  accentIcon={app.icon}
                  accentColor={app.color}
                  title={app.name}
                />
              ) : w.appId === "linear" ? (
                <AppSectionPanel
                  lang={lang}
                  slug={companySlug}
                  appHref={app.href}
                  isAdmin={isAdmin}
                  sections={LINEAR_SECTIONS}
                  accentIcon={app.icon}
                  accentColor={app.color}
                  title={app.name}
                  badgeSources={[
                    {
                      sectionId: "requests",
                      url: `/api/linear/companies/${companySlug}/inbox-count`,
                    },
                  ]}
                  // groupByTeam açıksa overview grup olur: takım linkleri + backlog rozetleri.
                  teamNavUrl={`/api/linear/companies/${companySlug}/nav-teams`}
                />
              ) : w.appId === "status" ? (
                <AppSectionPanel
                  lang={lang}
                  slug={companySlug}
                  appHref={app.href}
                  isAdmin={isAdmin}
                  sections={STATUS_SECTIONS}
                  accentIcon={app.icon}
                  accentColor={app.color}
                  title={app.name}
                />
              ) : undefined}
            </WindowFrame>
          )
        })}
    </div>
  )
}
