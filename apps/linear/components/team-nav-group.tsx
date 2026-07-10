"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar"
import { useUiFlags } from "@/lib/ui-flags-context"

interface NavTeam {
  id: string
  key: string
  name: string
  backlogCount: number
}

/** Takım harf-avatarı renk paleti — sırayla deterministik atanır. */
export const TEAM_NAV_COLORS = [
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#84cc16",
] as const

export function teamNavColor(index: number): string {
  return TEAM_NAV_COLORS[index % TEAM_NAV_COLORS.length]!
}

/**
 * Sidebar takım navigasyonu — `groupByTeam` uiFlag'i açıkken overview,
 * sekme yerine SIDEBAR'da grup olur: "Overview" grup başlığı altında YALNIZ
 * takım linkleri (`?team=<id>`; "tümü" linki bilinçli YOK — gruplama açıkken
 * liste daima takım bazlı gezilir). Her takım kendi renginde harf-avatar
 * taşır; rozet = backlog'ta bekleyen issue sayısı (60 sn'de bir tazelenir).
 */
export function TeamNavGroup({ basePath }: { basePath: string }) {
  const { groupByTeam } = useUiFlags()
  const t = useTranslations("nav")
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [teams, setTeams] = useState<NavTeam[] | null>(null)

  const slug = useMemo(() => {
    // basePath = /{lang}/d/{company-slug}
    const parts = basePath.split("/").filter(Boolean)
    return parts[parts.length - 1] ?? ""
  }, [basePath])

  useEffect(() => {
    if (!groupByTeam || !slug) return
    let alive = true
    const load = async () => {
      try {
        const res = await fetch(`/api/companies/${encodeURIComponent(slug)}/nav-teams`)
        if (!res.ok) return
        const json = (await res.json()) as {
          data?: { groupByTeam?: boolean; teams?: NavTeam[] }
        }
        if (alive && json.data?.groupByTeam && Array.isArray(json.data.teams)) {
          setTeams(json.data.teams)
        }
      } catch {
        // sessiz — sidebar navigasyonu kritik yol değil
      }
    }
    void load()
    const id = window.setInterval(load, 60_000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [groupByTeam, slug])

  if (!groupByTeam) return null

  const onOverview = pathname === basePath || pathname === `${basePath}/`
  const activeTeam = searchParams.get("team")

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{t("overview")}</SidebarGroupLabel>
      <SidebarMenu>
        {(teams ?? []).map((team, i) => (
          <SidebarMenuItem key={team.id}>
            {/* base-ui: asChild yok — render={<Link/>} deseni (nav-main ile aynı) */}
            <SidebarMenuButton
              isActive={onOverview && activeTeam === team.id}
              tooltip={team.name}
              render={<Link href={`${basePath}?team=${encodeURIComponent(team.id)}`} />}
            >
              {/* Harf-avatar — takıma özgü renk + baş harf */}
              <span
                aria-hidden
                className="flex size-4 shrink-0 items-center justify-center rounded-[5px] text-[9px] font-bold text-white"
                style={{ background: teamNavColor(i) }}
              >
                {(team.key || team.name).charAt(0).toUpperCase()}
              </span>
              <span>{team.key || team.name}</span>
            </SidebarMenuButton>
            {team.backlogCount > 0 ? (
              <SidebarMenuBadge>
                {team.backlogCount > 99 ? "99+" : team.backlogCount}
              </SidebarMenuBadge>
            ) : null}
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
