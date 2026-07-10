"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { Link, useFetcher } from "@/lib/router-compat"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { motion } from "framer-motion"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { Tag01FreeIcons } from "@hugeicons/core-free-icons"
import { TaskPriorityIcon } from "./task-priority-icon"
import { TaskContextMenu } from "./task-context-menu"
import { TaskActionsMenu } from "./task-actions-menu"
import { QuickAddInline } from "./quick-add-inline"
import { TaskHoverCard } from "./task-hover-card"
import { normalizeActionResult, type FetcherResult } from "./action-result"
import { cn } from "@workspace/ui/lib/utils"
import { playSuccessBell } from "@/lib/sounds"
import { useUiFlags } from "@/lib/ui-flags-context"
import { toast } from "sonner"
import type {
  Issue,
  IssueLabel,
  IssueState,
  IssueTeam,
} from "@/lib/linear/types"
import { ScrollArea } from "@workspace/ui/components/scroll-area"

type Props = {
  issues: Issue[]
  /** Takım id → o takımın workflow state'leri. Linear'da state'ler takıma özel. */
  statesByTeam: Record<string, IssueState[]>
  /** Takım id → o takımın etiketleri (kart menüleri için). */
  labelsByTeam: Record<string, IssueLabel[]>
  teams: IssueTeam[]
  /** Hızlı-ekleme ve fallback için etkin varsayılan takım. */
  defaultTeamId: string | null
  /** Aktif takım filtresi varken kart üstündeki takım rozetini gizle. */
  hideTeamBadge?: boolean
}

type StateOrder = IssueState["type"]

const STATE_TYPE_ORDER: StateOrder[] = [
  "triage",
  "backlog",
  "unstarted",
  "started",
  "completed",
  "canceled",
]

/**
 * Çok-takımlı kanban kolonu. Aynı isimli durumlar (Todo, In Progress…)
 * takımlar arası tek kolonda birleşir; `stateIdByTeam` her takımın o
 * kolona karşılık gelen state id'sini tutar (sürükle-bırakta kart kendi
 * takımının state'ine taşınsın diye).
 */
type KanbanColumn = {
  key: string
  name: string
  type: StateOrder
  color: string
  stateIdByTeam: Map<string, string>
}

const colKey = (name: string) => name.trim().toLowerCase()

export function KanbanBoard({
  issues,
  statesByTeam,
  labelsByTeam,
  teams,
  defaultTeamId,
  hideTeamBadge = false,
}: Props) {
  const t = useTranslations("linearLite.tasks.kanban")
  const fetcher = useFetcher<unknown>()
  const { kanbanDnd, kanbanQuickAdd } = useUiFlags()
  const [items, setItems] = useState<Issue[]>(issues)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [pendingMove, setPendingMove] = useState<{
    id: string
    prevState: IssueState
  } | null>(null)

  // Takım gruplaması + aktif takım filtresi varken rozet gereksiz (liste zaten tek takım).
  const showTeamBadge = !hideTeamBadge && teams.length > 1

  // Reconcile when loader data changes (revalidation after navigation)
  useEffect(() => setItems(issues), [issues])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  // Surface rollback when server rejects the move
  useEffect(() => {
    if (!pendingMove) return
    if (fetcher.state !== "idle") return
    const data = normalizeActionResult<FetcherResult>(fetcher.data)
    if (!data) return
    if (data.ok === false) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === pendingMove.id ? { ...i, state: pendingMove.prevState } : i,
        ),
      )
      toast.error(data.error ?? t("move_failed"))
    }
    setPendingMove(null)
  }, [fetcher.state, fetcher.data, pendingMove, t])

  // Kanonik kolonları kur: tüm takımların state'lerini isme göre birleştir.
  const columns = useMemo(() => {
    const byKey = new Map<string, KanbanColumn>()
    const upsert = (
      teamId: string,
      s: { id: string; name: string; type: StateOrder; color: string },
    ) => {
      const key = colKey(s.name)
      let col = byKey.get(key)
      if (!col) {
        col = {
          key,
          name: s.name,
          type: s.type,
          color: s.color,
          stateIdByTeam: new Map(),
        }
        byKey.set(key, col)
      }
      col.stateIdByTeam.set(teamId, s.id)
    }

    // İskelet: tüm takımların state'leri. "Duplicate" Linear default
    // workflow'unda canceled altında bir gürültü state'i — boş kolon olarak
    // gösterme (gerçek bir issue oradaysa aşağıdaki döngü yine kolon açar).
    for (const [teamId, sts] of Object.entries(statesByTeam)) {
      for (const s of sts) {
        if (colKey(s.name) === "duplicate") continue
        upsert(teamId, s)
      }
    }
    // Hiçbir issue düşmesin: state'i iskelette olmayan kayıtlar için de kolon aç.
    for (const i of items) upsert(i.team.id, i.state)

    return [...byKey.values()].sort((a, b) => {
      const ai = STATE_TYPE_ORDER.indexOf(a.type)
      const bi = STATE_TYPE_ORDER.indexOf(b.type)
      const at = ai === -1 ? 99 : ai
      const bt = bi === -1 ? 99 : bi
      if (at !== bt) return at - bt
      return a.name.localeCompare(b.name, "tr")
    })
  }, [statesByTeam, items])

  const grouped = useMemo(() => {
    const m = new Map<string, Issue[]>()
    for (const c of columns) m.set(c.key, [])
    for (const i of items) {
      const list = m.get(colKey(i.state.name))
      if (list) list.push(i)
    }
    return m
  }, [items, columns])

  const { activeColumns, emptyColumns } = useMemo(() => {
    const activeList: KanbanColumn[] = []
    const emptyList: KanbanColumn[] = []
    const draggingName =
      activeId !== null
        ? items.find((i) => i.id === activeId)?.state.name
        : null
    const draggingColKey = draggingName ? colKey(draggingName) : null
    for (const c of columns) {
      const len = grouped.get(c.key)?.length ?? 0
      const keepWhileDragging = draggingColKey === c.key
      if (len > 0 || keepWhileDragging) activeList.push(c)
      else emptyList.push(c)
    }
    return { activeColumns: activeList, emptyColumns: emptyList }
  }, [columns, grouped, activeId, items])

  const active = activeId ? items.find((i) => i.id === activeId) : null

  const onDragStart = (e: DragStartEvent) => {
    if (!kanbanDnd) return
    setActiveId(String(e.active.id))
  }

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    if (!kanbanDnd) return
    const { active, over } = e
    if (!over) return
    const issueId = String(active.id)
    const targetKey = String(over.id)

    const issue = items.find((i) => i.id === issueId)
    if (!issue) return
    if (colKey(issue.state.name) === targetKey) return
    const column = columns.find((c) => c.key === targetKey)
    if (!column) return

    // Hedef kolon, issue'nun kendi takımındaki hangi state'e karşılık geliyor?
    const targetStateId = column.stateIdByTeam.get(issue.team.id)
    if (!targetStateId) {
      toast.error(
        t("state_missing", { team: issue.team.name, state: column.name }),
      )
      return
    }
    const newState =
      statesByTeam[issue.team.id]?.find((s) => s.id === targetStateId) ?? {
        id: targetStateId,
        name: column.name,
        type: column.type,
        color: column.color,
      }

    const prevState = issue.state
    setItems((prev) =>
      prev.map((i) => (i.id === issueId ? { ...i, state: newState } : i)),
    )
    setPendingMove({ id: issueId, prevState })

    if (newState.type === "completed") {
      playSuccessBell(issueId)
    }

    const form = new FormData()
    form.set("intent", "move")
    form.set("issueId", issueId)
    form.set("stateId", targetStateId)
    // Panel action'ı: "/" → shim `${apiBase}/issues/actions`'a çevirir.
    void fetcher.submit(form, { method: "post", action: "/" })
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="flex h-full min-h-0 flex-1 items-stretch gap-3 overflow-x-auto pb-2">
        {activeColumns.map((column) => (
          <Column
            key={column.key}
            column={column}
            issues={grouped.get(column.key) ?? []}
            statesByTeam={statesByTeam}
            labelsByTeam={labelsByTeam}
            defaultTeamId={defaultTeamId}
            showTeamBadge={showTeamBadge}
            dndEnabled={kanbanDnd}
            quickAddEnabled={kanbanQuickAdd}
          />
        ))}
        {columns.length === 0 ? (
          <p className="px-2 py-6 text-sm text-muted-foreground">
            {t("no_states")}
          </p>
        ) : null}
        {emptyColumns.length > 0 ? (
          <aside className="flex h-full w-80 shrink-0 flex-col gap-2 overflow-y-auto rounded-xl border border-dashed border-border/50 bg-card/20 p-3">
            <p className="px-1 pt-0.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">
              {t("empty_columns")}
            </p>
            {emptyColumns.map((column) => (
              <EmptyColumnRow
                key={column.key}
                column={column}
                dndEnabled={kanbanDnd}
              />
            ))}
          </aside>
        ) : null}
      </div>
      <DragOverlay>
        {active ? (
          <CardBody issue={active} dragging showTeamBadge={showTeamBadge} />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function EmptyColumnRow({
  column,
  dndEnabled,
}: {
  column: KanbanColumn
  dndEnabled: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.key,
    disabled: !dndEnabled,
  })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex items-center gap-2.5 rounded-lg border border-dashed bg-card/40 px-3 py-2.5 text-xs transition-colors",
        isOver
          ? "border-foreground/40 bg-accent/40 text-foreground"
          : "border-border/60 text-muted-foreground hover:border-border",
      )}
    >
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: column.color }}
      />
      <span className="truncate font-medium text-foreground">
        {column.name}
      </span>
    </div>
  )
}

function Column({
  column,
  issues,
  statesByTeam,
  labelsByTeam,
  defaultTeamId,
  showTeamBadge,
  dndEnabled,
  quickAddEnabled,
}: {
  column: KanbanColumn
  issues: Issue[]
  statesByTeam: Record<string, IssueState[]>
  labelsByTeam: Record<string, IssueLabel[]>
  defaultTeamId: string | null
  showTeamBadge: boolean
  dndEnabled: boolean
  quickAddEnabled: boolean
}) {
  const t = useTranslations("linearLite.tasks.kanban")
  const { setNodeRef, isOver } = useDroppable({
    id: column.key,
    disabled: !dndEnabled,
  })
  // Hızlı-ekleme yalnızca varsayılan takımın bu kolona karşılık gelen bir
  // state'i varsa anlamlı (issue varsayılan takımda, o state'le açılır).
  const quickAddStateId =
    quickAddEnabled && defaultTeamId
      ? column.stateIdByTeam.get(defaultTeamId)
      : undefined
  return (
    <section
      ref={setNodeRef}
      className={cn(
        "flex h-full w-80 shrink-0 flex-col gap-2.5 rounded-xl border bg-card/50 p-2.5 transition-colors",
        isOver
          ? "border-foreground/30 bg-accent/30"
          : "border-border/60",
      )}
    >
      <header className="flex shrink-0 items-center gap-2 px-1.5 pt-1 pb-0.5">
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: column.color }}
        />
        <span className="text-[13px] font-semibold tracking-tight text-foreground">
          {column.name}
        </span>
        <span className="ml-auto rounded-md bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
          {issues.length}
        </span>
      </header>
      <ScrollArea className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-3">
        {issues.map((issue) => (
          <DraggableCard
            key={issue.id}
            issue={issue}
            states={statesByTeam[issue.team.id] ?? []}
            labels={labelsByTeam[issue.team.id] ?? []}
            showTeamBadge={showTeamBadge}
            dndEnabled={dndEnabled}
          />
        ))}
        {issues.length === 0 ? (
          <p className="my-auto px-2 py-3 text-center text-[11px] text-muted-foreground/60">
            {t("empty")}
          </p>
        ) : null}
      </ScrollArea>
      {quickAddStateId ? (
        <div className="shrink-0">
          <QuickAddInline
            variant="kanban"
            teamId={defaultTeamId ?? undefined}
            stateId={quickAddStateId}
          />
        </div>
      ) : null}
    </section>
  )
}

function DraggableCard({
  issue,
  states,
  labels,
  showTeamBadge,
  dndEnabled,
}: {
  issue: Issue
  states: IssueState[]
  labels: IssueLabel[]
  showTeamBadge: boolean
  dndEnabled: boolean
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: issue.id,
    disabled: !dndEnabled,
  })
  return (
    <TaskContextMenu issue={issue} states={states} labels={labels}>
      <motion.div
        ref={setNodeRef}
        {...(dndEnabled ? attributes : {})}
        {...(dndEnabled ? listeners : {})}
        layout
        transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
        className={cn(
          "group/kc relative",
          dndEnabled ? "touch-none" : null,
          isDragging && "opacity-30",
        )}
      >
        <TaskHoverCard issueId={issue.id}>
          <CardBody
            issue={issue}
            draggable={dndEnabled}
            showTeamBadge={showTeamBadge}
          />
        </TaskHoverCard>
        {!isDragging ? (
          <div
            className="absolute top-1 right-1 opacity-0 transition-opacity duration-150 group-hover/kc:opacity-100 data-[state=open]:opacity-100"
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <TaskActionsMenu issue={issue} states={states} labels={labels} />
          </div>
        ) : null}
      </motion.div>
    </TaskContextMenu>
  )
}

function CardBody({
  issue,
  dragging = false,
  draggable = true,
  showTeamBadge = false,
}: {
  issue: Issue
  dragging?: boolean
  draggable?: boolean
  showTeamBadge?: boolean
}) {
  return (
    <Link
      to={`/tasks/${issue.id}`}
      onClick={(e) => {
        // dnd-kit pointer activation has distance:6, so a clean click
        // is allowed through. But during a real drag the click event
        // may still fire on mouseup — suppress when overlay is active.
        if (dragging) e.preventDefault()
      }}
      className={cn(
        "group flex flex-col gap-2 rounded-lg border border-border/60 bg-background px-3.5 py-3 text-left shadow-sm transition-colors",
        dragging
          ? "rotate-1 cursor-grabbing ring-2 ring-foreground/20"
          : draggable
            ? "cursor-grab hover:border-border hover:bg-accent/40"
            : "cursor-pointer hover:border-border hover:bg-accent/40",
      )}
    >
      <div className="flex items-center gap-2">
        <TaskPriorityIcon priority={issue.priority} />
        <span className="font-mono text-[11px] tracking-tight text-muted-foreground">
          {issue.identifier}
        </span>
        {showTeamBadge ? (
          <span className="ml-auto inline-flex max-w-[45%] items-center gap-1 rounded-md border border-border/40 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            <span className="size-1 shrink-0 rounded-full bg-foreground/40" />
            <span className="truncate">{issue.team.name}</span>
          </span>
        ) : null}
      </div>
      <p className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground">
        {issue.title}
      </p>
      {issue.labels.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {issue.labels.slice(0, 3).map((l) => (
            <span
              key={l.id}
              className="inline-flex items-center gap-1 rounded-md border border-border/40 bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: l.color }}
              />
              {l.name}
            </span>
          ))}
          {issue.labels.length > 3 ? (
            <span className="inline-flex items-center text-[10px] text-muted-foreground">
              <HugeiconsIcon
                icon={Tag01FreeIcons as IconSvgElement}
                size={10}
                strokeWidth={2}
                className="mr-0.5"
              />
              +{issue.labels.length - 3}
            </span>
          ) : null}
        </div>
      ) : null}
    </Link>
  )
}
