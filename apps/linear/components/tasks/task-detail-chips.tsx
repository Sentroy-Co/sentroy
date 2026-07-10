"use client"

// Triage app/components/tasks/task-detail-chips.tsx portu (PLAN §6).
import { useEffect } from "react"
import { useTranslations } from "next-intl"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  AlertCircleFreeIcons,
  ArrowDown02FreeIcons,
  ArrowUp02FreeIcons,
  CircleFreeIcons,
  Menu02FreeIcons,
  MinusSignFreeIcons,
  Tag01FreeIcons,
  UserFreeIcons,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { useFetcher } from "@/lib/router-compat"
import { TaskFormChip, type ChipItem } from "./task-form-chip"
import { normalizeActionResult, type FetcherResult } from "./action-result"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import type {
  Issue,
  IssueLabel,
  IssuePriority,
  IssueState,
  IssueUser,
} from "@/lib/linear/types"

type Props = {
  issue: Issue
  states: IssueState[]
  labels: IssueLabel[]
  users: IssueUser[]
  showStatus?: boolean
  showAssignee?: boolean
  showLabels?: boolean
  /**
   * Opsiyonel: chip değişiklikleri mevcut route dışında bir hedefe
   * gidecekse (örn. liste görünümlerinden kullanım). Varsayılan: mevcut.
   */
  action?: string
}

const PRIORITY_META: Record<
  IssuePriority,
  { labelKey: string; icon: IconSvgElement; swatch: string }
> = {
  0: {
    labelKey: "no_priority",
    icon: MinusSignFreeIcons as IconSvgElement,
    swatch: "#a3a3a3",
  },
  1: {
    labelKey: "urgent",
    icon: AlertCircleFreeIcons as IconSvgElement,
    swatch: "#ef4444",
  },
  2: {
    labelKey: "high",
    icon: ArrowUp02FreeIcons as IconSvgElement,
    swatch: "#f97316",
  },
  3: {
    labelKey: "medium",
    icon: Menu02FreeIcons as IconSvgElement,
    swatch: "#eab308",
  },
  4: {
    labelKey: "low",
    icon: ArrowDown02FreeIcons as IconSvgElement,
    swatch: "#9ca3af",
  },
}

function initials(name?: string | null, email?: string | null): string {
  const src = (name && name.trim()) || email?.split("@")[0] || "?"
  return src
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("")
}

export function TaskDetailChips({
  issue,
  states,
  labels,
  users,
  showStatus = true,
  showAssignee = true,
  showLabels = true,
  action,
}: Props) {
  const fetcher = useFetcher<FetcherResult>()
  const t = useTranslations("linearLite")

  useEffect(() => {
    if (fetcher.state !== "idle") return
    const data = normalizeActionResult<FetcherResult>(fetcher.data)
    if (!data) return
    if (data.ok === false && data.error) toast.error(data.error)
  }, [fetcher.state, fetcher.data])

  const submit = (fields: Record<string, string | string[]>) => {
    const form = new FormData()
    form.set("issueId", issue.id)
    for (const [k, v] of Object.entries(fields)) {
      if (Array.isArray(v)) for (const item of v) form.append(k, item)
      else form.set(k, v)
    }
    void fetcher.submit(form, { method: "post", action })
  }

  const stateItems: ChipItem[] = states.map((s) => ({
    id: s.id,
    label: s.name,
    swatch: s.color,
  }))

  const priorityItems: ChipItem[] = (
    [0, 1, 2, 3, 4] as IssuePriority[]
  ).map((p) => ({
    id: String(p),
    label: t(`tasks.priority.${PRIORITY_META[p].labelKey}`),
    swatch: PRIORITY_META[p].swatch,
  }))

  const userItems: ChipItem[] = users.map((u) => ({
    id: u.id,
    label: u.name,
    description: u.email ?? undefined,
    icon: (
      <Avatar className="size-4">
        {u.avatarUrl ? <AvatarImage src={u.avatarUrl} alt={u.name} /> : null}
        <AvatarFallback className="text-[8px]">
          {initials(u.name, u.email)}
        </AvatarFallback>
      </Avatar>
    ),
  }))

  const labelItems: ChipItem[] = labels.map((l) => ({
    id: l.id,
    label: l.name,
    swatch: l.color,
    parentId: l.parentId ?? null,
    isGroup: l.isGroup ?? false,
  }))

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {showStatus ? (
        <TaskFormChip
          triggerIcon={
            <HugeiconsIcon
              icon={CircleFreeIcons as IconSvgElement}
              size={12}
              strokeWidth={2}
            />
          }
          placeholder={t("tasks.menu.status")}
          items={stateItems}
          valueId={issue.state.id}
          onChange={(id) => {
            if (!id || id === issue.state.id) return
            submit({ intent: "move", stateId: id })
          }}
        />
      ) : null}
      <TaskFormChip
        triggerIcon={
          <HugeiconsIcon
            icon={
              PRIORITY_META[issue.priority].icon
            }
            size={12}
            strokeWidth={2}
          />
        }
        placeholder={t("tasks.menu.priority")}
        items={priorityItems}
        valueId={String(issue.priority)}
        onChange={(id) => {
          if (!id || Number(id) === issue.priority) return
          submit({ intent: "set-priority", priority: id })
        }}
      />
      {showAssignee ? (
        <TaskFormChip
          triggerIcon={
            <HugeiconsIcon
              icon={UserFreeIcons as IconSvgElement}
              size={12}
              strokeWidth={2}
            />
          }
          placeholder={t("tasks.menu.assignee")}
          items={userItems}
          valueId={issue.assignee?.id ?? null}
          onChange={(id) => {
            if (id === (issue.assignee?.id ?? null)) return
            submit({ intent: "set-assignee", assigneeId: id ?? "" })
          }}
          allowClear
          clearLabel={t("tasks.menu.clearAssignee")}
        />
      ) : null}
      {showLabels ? (
        <TaskFormChip
          triggerIcon={
            <HugeiconsIcon
              icon={Tag01FreeIcons as IconSvgElement}
              size={12}
              strokeWidth={2}
            />
          }
          placeholder={t("tasks.menu.labels")}
          items={labelItems}
          multi
          valueIds={issue.labels.map((l) => l.id)}
          onChange={(ids) => {
            const current = new Set(issue.labels.map((l) => l.id))
            const next = new Set(ids)
            if (
              current.size === next.size &&
              [...current].every((v) => next.has(v))
            )
              return
            submit({ intent: "set-labels", labelIds: ids })
          }}
          emptyText={t("tasks.menu.noTeamLabels")}
        />
      ) : null}
    </div>
  )
}
