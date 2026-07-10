"use client"

/**
 * Panel (dashboard) client içeriği — triage home.tsx default export'unun
 * JSX/etkileşim kısmının portu. Server verisi `app/[lang]/d/[company-slug]/
 * page.tsx`'ten props olarak gelir (react-router loader'ın karşılığı).
 *
 * Arka plan tazeleme iki kanaldan: 60s polling (useAutoRevalidate) +
 * webhook-tabanlı SSE (useLinearSync — `${apiBase}/sync/stream`).
 */

import { useState } from "react"
import { useTranslations } from "next-intl"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  TaskAdd01FreeIcons,
  ArrowRight02FreeIcons,
} from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { FadeIn } from "@/components/motion/fade-in"
import { SkeletonMorph } from "@/components/motion/skeleton-morph"
import { TaskList, TaskListSkeleton } from "@/components/tasks/task-list"
import { TaskFilterMenu } from "@/components/tasks/task-filter-menu"
import { NewTaskDialog } from "@/components/tasks/new-task-dialog"
import { QuickAddInline } from "@/components/tasks/quick-add-inline"
import { KanbanBoard } from "@/components/tasks/kanban-board"
import { DashboardViewToggle } from "@/components/tasks/dashboard-view-toggle"
import { EmptyState } from "@/components/common/empty-state"
import { ErrorState } from "@/components/common/error-state"
import { useUiStore } from "@/stores/ui-store"
import { useAutoRevalidate } from "@/hooks/use-auto-revalidate"
import { useLinearSync } from "@/hooks/use-linear-sync"
import type { ListIssuesScope } from "@/lib/linear/issues"
import type {
  Issue,
  IssueLabel,
  IssueState,
  IssueTeam,
  IssueUser,
} from "@/lib/linear/types"

export type PanelData =
  | {
      ok: true
      issues: Issue[]
      /** Takım id → o takımın workflow state'leri (kanban kolonları + kart menüleri). */
      statesByTeam: Record<string, IssueState[]>
      /** Takım id → o takımın etiketleri (kart menülerinde issue'nun takımına göre). */
      labelsByTeam: Record<string, IssueLabel[]>
      /** Tüm takımların etiketlerinin birleşimi — filtre menüsü için. */
      labels: IssueLabel[]
      teams: IssueTeam[]
      /** Kanban hızlı-ekleme ve fallback için etkin varsayılan takım. */
      defaultTeamId: string | null
      users: IssueUser[]
      requester: "linear" | "proxy"
      hasNextPage: boolean
      cursor: string | null
      filters: {
        scope: ListIssuesScope
        state: "open" | "closed" | "all"
        assigneeIds: string[]
        labelIds: string[]
        /** groupByTeam açıkken seçili takım (?team); null → tümü. */
        teamId: string | null
      }
    }
  | { ok: false; error: string }

export function PanelContent({ data }: { data: PanelData }) {
  const t = useTranslations("linearLite.panel")
  const view = useUiStore((s) => s.dashboardView)
  const [newTaskOpen, setNewTaskOpen] = useState(false)

  // Aktif takım filtresi (?team) → başlık "[Takım] Issues" + kart takım rozetini gizle.
  const activeTeamId = data.ok ? data.filters.teamId : null
  const activeTeamName = activeTeamId && data.ok
    ? (data.teams.find((tm) => tm.id === activeTeamId)?.name ?? null)
    : null

  // Linear'da yapılan değişiklikler arka planda yansısın. Dashboard
  // detay sayfasından daha az kritik olduğu için 60s periyot.
  useAutoRevalidate({ intervalMs: 60_000 })
  // Webhook → SSE köprüsü: event geldiğinde debounce'lu revalidate.
  useLinearSync()

  return (
    <div
      className={cn(
        "flex flex-col gap-6 px-4 py-6 md:px-8",
        // Kanban dikey scroll'u kolonların kendisine bırakmak için
        // wrapper'ı viewport'a sabitle.
        view === "kanban" && "h-full min-h-0",
      )}
    >
      <FadeIn className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {/* Takım filtresi aktifse "[Takım] Issues", yoksa "Issues". */}
            {activeTeamName ? t("titleWithTeam", { team: activeTeamName }) : t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("tagline")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DashboardViewToggle />
          {data.ok ? (
            <TaskFilterMenu
              users={data.users}
              labels={data.labels}
              scope={data.filters.scope}
              stateFilter={data.filters.state}
              assigneeIds={data.filters.assigneeIds}
              labelIds={data.filters.labelIds}
              requesterKind={data.requester}
            />
          ) : null}
          <Button
            type="button"
            size="sm"
            onClick={() => setNewTaskOpen(true)}
          >
            <HugeiconsIcon
              icon={TaskAdd01FreeIcons as IconSvgElement}
              size={14}
              strokeWidth={2}
            />
            {t("newTask")}
          </Button>
        </div>
      </FadeIn>

      {/* Takım navigasyonu artık SIDEBAR'da (TeamNavGroup + OS AppSectionPanel
          teamNavUrl) — eski TeamTabs sekme UI'ı kaldırıldı; seçili takım yine
          ?team search param'ıyla sunucuda filtrelenir. */}

      <SkeletonMorph
        loading={false}
        skeleton={<TaskListSkeleton />}
        className={cn(view === "kanban" && "flex min-h-0 flex-1 flex-col")}
      >
        {data.ok ? (
          data.issues.length > 0 ? (
            view === "kanban" &&
            Object.values(data.statesByTeam).some((s) => s.length > 0) ? (
              <KanbanBoard
                issues={data.issues}
                statesByTeam={data.statesByTeam}
                labelsByTeam={data.labelsByTeam}
                teams={data.teams}
                defaultTeamId={data.defaultTeamId}
                hideTeamBadge={Boolean(activeTeamId)}
              />
            ) : (
              <div className="flex flex-col gap-2">
                <TaskList
                  issues={data.issues}
                  statesByTeam={data.statesByTeam}
                  labelsByTeam={data.labelsByTeam}
                />
                <QuickAddInline variant="list" />
              </div>
            )
          ) : (
            <EmptyState
              title={t("empty.title")}
              description={t("empty.description")}
              action={
                <Button
                  type="button"
                  size="sm"
                  className="group"
                  onClick={() => setNewTaskOpen(true)}
                >
                  {t("empty.cta")}
                  <span
                    aria-hidden
                    className="ml-0 inline-flex w-0 items-center justify-end overflow-hidden opacity-0 transition-all duration-200 ease-out group-hover:ml-1.5 group-hover:w-4 group-hover:opacity-100"
                  >
                    <HugeiconsIcon
                      icon={ArrowRight02FreeIcons as IconSvgElement}
                      size={12}
                      strokeWidth={2}
                    />
                  </span>
                </Button>
              }
            />
          )
        ) : (
          <ErrorState title={t("errorTitle")} description={data.error} />
        )}
      </SkeletonMorph>

      <NewTaskDialog open={newTaskOpen} onOpenChange={setNewTaskOpen} />
    </div>
  )
}
