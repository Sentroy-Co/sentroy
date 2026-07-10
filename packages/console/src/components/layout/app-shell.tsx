"use client"

import type { ReactNode } from "react"
import { Logo } from "@workspace/console/components/shared"
import { SidebarProvider } from "@workspace/ui/components/sidebar"
import { TeamSwitcher } from "@workspace/console/components/sidebar/team-switcher"
import { NavUser } from "@workspace/console/components/sidebar/nav-user"
import { FloatingHeader } from "./floating-header"

/**
 * Sentroy "üst seviye" sayfaların ortak iskeleti — company picker, app
 * picker, settings gibi tam-sidebar olmadan render edilen ekranlar.
 *
 * Header için landing-style `FloatingHeader` (scroll-aware morphing pill)
 * paylaşılır — landing ile picker / settings arasında tutarlı brand
 * deneyimi.
 *
 * Slot mantığı:
 *   - start  → Logo (her zaman)
 *   - center → TeamSwitcher (showTeamSwitcher false ise gizli)
 *   - end    → NavUser (compact veya full, prop ile kontrol)
 *
 * Body width 3 mod:
 *   - "default" → max-w-5xl (app picker, generic)
 *   - "narrow"  → max-w-3xl (settings, profile-style)
 *   - "wide"    → max-w-6xl (admin tabloları, ileride)
 *
 * `SidebarProvider` ile sarılı — TeamSwitcher ve NavUser sidebar
 * primitive'lerini (`useSidebar`) kullanır; gerçek Sidebar render
 * edilmez. Header floating olduğu için body üstte 64-72px padding
 * eklenir, içerik header'ın altına gizlenmez.
 */

export interface AppShellProps {
  children: ReactNode
  showTeamSwitcher?: boolean
  /** Body genişlik preset'i — default 5xl, narrow 3xl, wide 6xl. */
  width?: "default" | "narrow" | "wide"
  /** Tam custom body class — preset'leri override eder. */
  bodyClassName?: string
  /**
   * NavUser compact mode — true iken avatar-only trigger. Default
   * `showTeamSwitcher=false` ise auto compact (NavUser tek branding).
   */
  compactNavUser?: boolean
}

const WIDTH_CLASS: Record<NonNullable<AppShellProps["width"]>, string> = {
  default: "max-w-5xl",
  narrow: "max-w-3xl",
  wide: "max-w-6xl",
}

export function AppShell({
  children,
  showTeamSwitcher = true,
  width = "default",
  bodyClassName,
  compactNavUser = false,
}: AppShellProps) {
  const navCompact = compactNavUser || !showTeamSwitcher

  return (
    <SidebarProvider>
      <div className="flex min-h-svh w-full flex-col">
        <FloatingHeader
          start={
            <a
              href="/"
              className="inline-flex items-center gap-2"
              aria-label="Sentroy"
            >
              <Logo size="md" />
            </a>
          }
          center={
            showTeamSwitcher ? (
              // TeamSwitcher SidebarMenu içinde — width 280px ile sınırlı
              // ki dropdown trigger'ı pill-header'ı patlatmasın.
              <div className="w-[260px]">
                <TeamSwitcher />
              </div>
            ) : null
          }
          end={<NavUser compact={navCompact} />}
        />

        {/* Body — header floating + fixed olduğundan üst boşluk ekliyoruz.
            FloatingHeader h-14 (56px) + scroll-pill morph (~16-24px gap) +
            içerik ile rahat nefes payı. pt-24 dar geliyordu (özellikle app
            picker'da h1 header'a yapışık görünüyordu) — pt-28 mobile,
            md:pt-32 desktop. */}
        <main
          className={
            bodyClassName ??
            `flex-1 mx-auto w-full ${WIDTH_CLASS[width]} px-4 pt-28 pb-8 md:pt-32 md:pb-12`
          }
        >
          {children}
        </main>
      </div>
    </SidebarProvider>
  )
}
