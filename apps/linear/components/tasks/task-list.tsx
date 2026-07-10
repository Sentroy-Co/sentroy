"use client"

import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useLocale, useTranslations } from "next-intl"
import { Link, useFetcher } from "@/lib/router-compat"
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { DragDropVerticalFreeIcons } from "@hugeicons/core-free-icons"
import { TaskStatusBadge } from "./task-status-badge"
import { TaskPriorityIcon } from "./task-priority-icon"
import { TaskContextMenu } from "./task-context-menu"
import { TaskCardSkeleton } from "./task-card"
import { TaskHoverCard } from "./task-hover-card"
import { normalizeActionResult, type FetcherResult } from "./action-result"
import { cn } from "@workspace/ui/lib/utils"
import { toast } from "sonner"
import { useUiFlags } from "@/lib/ui-flags-context"
import type { Issue, IssueLabel, IssueState } from "@/lib/linear/types"

type Props = {
  issues: Issue[]
  /** Takım id → state'ler. Sağ-tık menüsü her issue'nun takımına göre. */
  statesByTeam?: Record<string, IssueState[]>
  /** Takım id → etiketler. Sağ-tık menüsü her issue'nun takımına göre. */
  labelsByTeam?: Record<string, IssueLabel[]>
}

function useRelativeFormat(): (value: string) => string {
  const t = useTranslations("linearLite.tasks.relative")
  const locale = useLocale()
  return (value: string): string => {
    try {
      const d = new Date(value)
      const diffMs = Date.now() - d.getTime()
      const minute = 60_000
      const hour = 60 * minute
      const day = 24 * hour
      if (diffMs < minute) return t("now")
      if (diffMs < hour)
        return t("minutes", { count: Math.floor(diffMs / minute) })
      if (diffMs < day) return t("hours", { count: Math.floor(diffMs / hour) })
      if (diffMs < 30 * day)
        return t("days", { count: Math.floor(diffMs / day) })
      return d.toLocaleDateString(locale)
    } catch {
      return ""
    }
  }
}

/**
 * Compute a new Linear sortOrder for an item moved to `newIndex` in a
 * list that's already been arrayMove'd into its final ordering.
 *
 * Linear sortOrder is a float; we slide the moved item between its
 * new neighbors by averaging their sortOrders. Edge cases:
 *   - Top of list:    above = bottom?.sortOrder - 1
 *   - Bottom of list: below = top?.sortOrder + 1
 *   - Single item:    anywhere works; return 0
 */
function calculateSortOrder(
  reordered: Issue[],
  newIndex: number,
): number {
  const prev = reordered[newIndex - 1]
  const next = reordered[newIndex + 1]
  const prevSO = prev?.sortOrder
  const nextSO = next?.sortOrder
  if (typeof prevSO === "number" && typeof nextSO === "number") {
    return (prevSO + nextSO) / 2
  }
  if (typeof prevSO === "number") return prevSO + 1
  if (typeof nextSO === "number") return nextSO - 1
  return 0
}

export function TaskList({ issues, statesByTeam, labelsByTeam }: Props) {
  const t = useTranslations("linearLite.tasks.list")
  const fetcher = useFetcher<unknown>()
  const { listDnd } = useUiFlags()
  const [items, setItems] = useState<Issue[]>(issues)
  const [pendingMove, setPendingMove] = useState<Issue[] | null>(null)

  // Reconcile when loader data changes (revalidation after navigation/sync).
  useEffect(() => setItems(issues), [issues])

  // Rollback on server error.
  useEffect(() => {
    if (!pendingMove) return
    if (fetcher.state !== "idle") return
    const data = normalizeActionResult<FetcherResult>(fetcher.data)
    if (!data) return
    if (data.ok === false) {
      setItems(pendingMove)
      toast.error(data.error ?? t("reorder_failed"))
    }
    setPendingMove(null)
  }, [fetcher.state, fetcher.data, pendingMove, t])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const ids = useMemo(() => items.map((i) => i.id), [items])

  const onDragEnd = (e: DragEndEvent) => {
    if (!listDnd) return
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((i) => i.id === active.id)
    const newIndex = items.findIndex((i) => i.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return

    const reordered = arrayMove(items, oldIndex, newIndex)
    const sortOrder = calculateSortOrder(reordered, newIndex)

    setPendingMove(items) // snapshot for rollback
    setItems(reordered)

    const form = new FormData()
    form.set("intent", "reorder")
    form.set("issueId", String(active.id))
    form.set("sortOrder", String(sortOrder))
    // Panel action'ı: "/" → shim `${apiBase}/issues/actions`'a çevirir.
    void fetcher.submit(form, { method: "post", action: "/" })
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {items.map((issue) => (
              <SortableRow
                key={issue.id}
                issue={issue}
                statesByTeam={statesByTeam}
                labelsByTeam={labelsByTeam}
                dndEnabled={listDnd}
              />
            ))}
          </AnimatePresence>
        </ul>
      </SortableContext>
    </DndContext>
  )
}

function SortableRow({
  issue,
  statesByTeam,
  labelsByTeam,
  dndEnabled,
}: {
  issue: Issue
  statesByTeam?: Record<string, IssueState[]>
  labelsByTeam?: Record<string, IssueLabel[]>
  dndEnabled: boolean
}) {
  const t = useTranslations("linearLite.tasks.list")
  const formatRelative = useRelativeFormat()
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: issue.id, disabled: !dndEnabled })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const card = (
    <motion.li
      ref={setNodeRef}
      style={style}
      layout
      className={cn(
        "group flex items-center gap-3 rounded-lg border border-border/60 bg-card px-3 py-2.5 transition-colors hover:border-border hover:bg-accent/30",
        isDragging && "z-10 opacity-70 shadow-lg ring-1 ring-foreground/10",
      )}
    >
      {dndEnabled ? (
        <button
          ref={setActivatorNodeRef}
          type="button"
          aria-label={t("drag_handle")}
          {...attributes}
          {...listeners}
          className={cn(
            "flex size-5 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground/50 opacity-0 transition-opacity",
            "group-hover:opacity-100 hover:bg-accent hover:text-foreground",
            "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            isDragging && "cursor-grabbing opacity-100",
          )}
          onClick={(e) => e.preventDefault()}
        >
          <HugeiconsIcon
            icon={DragDropVerticalFreeIcons as IconSvgElement}
            size={14}
            strokeWidth={2}
          />
        </button>
      ) : null}
      <Link
        to={`/tasks/${issue.id}`}
        className="flex min-w-0 flex-1 items-center gap-3 outline-none"
        onClick={(e) => {
          // dnd-kit pointer activation distance:6 ile clean click geçer;
          // ama drag sırasında click event'i mouseup'ta yine tetiklenebilir.
          if (isDragging) e.preventDefault()
        }}
      >
        <TaskPriorityIcon priority={issue.priority} />
        <span className="font-mono text-[10px] tracking-tight text-muted-foreground">
          {issue.identifier}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {issue.title}
        </span>
        <div className="hidden items-center gap-2 sm:flex">
          {issue.labels.slice(0, 2).map((l) => (
            <span
              key={l.id}
              className="inline-flex items-center gap-1 rounded-md border border-border/40 bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: l.color }}
              />
              {l.name}
            </span>
          ))}
        </div>
        <TaskStatusBadge state={issue.state} />
        <span className="hidden w-12 shrink-0 text-right text-[11px] text-muted-foreground md:inline-block">
          {formatRelative(issue.updatedAt)}
        </span>
      </Link>
    </motion.li>
  )

  const wrapped = (
    <TaskHoverCard issueId={issue.id}>{card}</TaskHoverCard>
  )

  if (!statesByTeam || !labelsByTeam) return wrapped

  return (
    <TaskContextMenu
      issue={issue}
      states={statesByTeam[issue.team.id] ?? []}
      labels={labelsByTeam[issue.team.id] ?? []}
    >
      {wrapped}
    </TaskContextMenu>
  )
}

export function TaskListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }).map((_, i) => (
        <TaskCardSkeleton key={i} />
      ))}
    </div>
  )
}
