"use client"

import { useTranslations } from "next-intl"
import { useSearchParams } from "@/lib/router-compat"
import { useUiFlags } from "@/lib/ui-flags-context"
import { cn } from "@workspace/ui/lib/utils"
import type { IssueTeam } from "@/lib/linear/types"

/**
 * Overview'de takım-takım görünüm — yalnız `groupByTeam` uiFlag açıkken görünür.
 * "Tümü" + her takım için pill; seçim `?team=<id>` search param'ına yazılır,
 * sunucu (page.tsx) o takıma filtreler. Panel-dışı issue modu (showAllIssues)
 * ile de uyumlu; takım filtresi listIssues teamFilter'ıyla AND'lenir.
 */
export function TeamTabs({
  teams,
  activeTeamId,
}: {
  teams: IssueTeam[]
  activeTeamId: string | null
}) {
  const { groupByTeam } = useUiFlags()
  const t = useTranslations("linearLite.panel")
  const [, setParams] = useSearchParams()

  if (!groupByTeam || teams.length === 0) return null

  const selectTeam = (id: string | null) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (id) next.set("team", id)
        else next.delete("team")
        next.delete("cursor")
        return next
      },
      { replace: true },
    )
  }

  const pill = (active: boolean) =>
    cn(
      "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
      active
        ? "border-transparent bg-foreground text-background"
        : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground",
    )

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        className={pill(!activeTeamId)}
        onClick={() => selectTeam(null)}
      >
        {t("allTeams")}
      </button>
      {teams.map((team) => (
        <button
          key={team.id}
          type="button"
          className={pill(activeTeamId === team.id)}
          onClick={() => selectTeam(team.id)}
          title={team.name}
        >
          {team.key || team.name}
        </button>
      ))}
    </div>
  )
}
