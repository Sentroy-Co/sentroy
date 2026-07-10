"use client"

import { useTranslations } from "next-intl"
import { useSearchParams } from "@/lib/router-compat"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  FilterHorizontalFreeIcons,
  FilterResetFreeIcons,
  UserGroupFreeIcons,
  UserCircleFreeIcons,
  Tag01FreeIcons,
  CircleFreeIcons,
  UserBlock01FreeIcons,
} from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuGroup,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@workspace/ui/components/dropdown-menu"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { cn } from "@workspace/ui/lib/utils"
import type { IssueLabel, IssueUser } from "@/lib/linear/types"

type Scope = "mine" | "workspace"
type StateFilter = "open" | "all" | "closed"

type Props = {
  users: IssueUser[]
  labels: IssueLabel[]
  scope: Scope
  stateFilter: StateFilter
  assigneeIds: string[]
  labelIds: string[]
  requesterKind: "linear" | "proxy"
  className?: string
}

const UNASSIGNED_TOKEN = "__unassigned__"

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?"
}

function renderLabelGroups(
  all: IssueLabel[],
  selected: Set<string>,
  onToggle: (id: string) => void,
  emptyGroupText: string,
): React.ReactNode {
  const groups = all.filter((l) => l.isGroup)
  const groupMap = new Map(groups.map((g) => [g.id, g]))
  const roots: IssueLabel[] = []
  const childrenByParent = new Map<string, IssueLabel[]>()

  for (const l of all) {
    if (l.isGroup) continue
    if (l.parentId && groupMap.has(l.parentId)) {
      const arr = childrenByParent.get(l.parentId) ?? []
      arr.push(l)
      childrenByParent.set(l.parentId, arr)
    } else {
      roots.push(l)
    }
  }

  const row = (l: IssueLabel, indent = false) => (
    <DropdownMenuCheckboxItem
      key={l.id}
      checked={selected.has(l.id)}
      onClick={(e) => {
        e.preventDefault()
        onToggle(l.id)
      }}
      className={indent ? "pl-9" : undefined}
    >
      <span
        className="size-2 rounded-full"
        style={{ backgroundColor: l.color }}
        aria-hidden
      />
      {l.name}
    </DropdownMenuCheckboxItem>
  )

  const orderedGroups = [...groups].sort((a, b) =>
    a.name.localeCompare(b.name, "tr"),
  )

  return (
    <>
      {roots.map((l) => row(l))}
      {orderedGroups.map((g) => {
        const kids = childrenByParent.get(g.id) ?? []
        return (
          <div key={g.id} className="flex flex-col">
            <div className="mt-1 mb-0.5 flex items-center gap-2 px-3 pt-1">
              <span
                className="size-1.5 shrink-0 rounded-full opacity-80"
                style={{ backgroundColor: g.color }}
                aria-hidden
              />
              <span className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground/80 uppercase">
                {g.name}
              </span>
            </div>
            {kids.map((k) => row(k, true))}
            {kids.length === 0 ? (
              <p className="pl-9 text-[10px] text-muted-foreground/60">
                {emptyGroupText}
              </p>
            ) : null}
          </div>
        )
      })}
    </>
  )
}

export function TaskFilterMenu({
  users,
  labels,
  scope,
  stateFilter,
  assigneeIds,
  labelIds,
  requesterKind,
  className,
}: Props) {
  const t = useTranslations("linearLite.tasks.filter")
  const [, setParams] = useSearchParams()

  const selectedAssignees = new Set(assigneeIds)
  const selectedLabels = new Set(labelIds)
  const activeCount =
    (scope === "mine" ? 1 : 0) +
    (stateFilter !== "all" ? 1 : 0) +
    assigneeIds.length +
    labelIds.length

  const update = (mutate: (next: URLSearchParams) => void) => {
    // Not: react-router'daki preventScrollReset shim'de yok — replace ile
    // history'yi kirletmeden güncelliyoruz.
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        mutate(next)
        next.delete("cursor")
        return next
      },
      { replace: true },
    )
  }

  const setScope = (value: Scope) =>
    update((next) => {
      if (value === "workspace") next.delete("scope")
      else next.set("scope", value)
    })

  const setStateFilter = (value: StateFilter) =>
    update((next) => {
      if (value === "all") next.delete("state")
      else next.set("state", value)
    })

  const toggleAssignee = (id: string) =>
    update((next) => {
      const existing = new Set(next.getAll("assignee"))
      if (existing.has(id)) existing.delete(id)
      else existing.add(id)
      next.delete("assignee")
      for (const a of existing) next.append("assignee", a)
    })

  const toggleLabel = (id: string) =>
    update((next) => {
      const existing = new Set(next.getAll("label"))
      if (existing.has(id)) existing.delete(id)
      else existing.add(id)
      next.delete("label")
      for (const l of existing) next.append("label", l)
    })

  const clearAll = () =>
    update((next) => {
      next.delete("scope")
      next.delete("state")
      next.delete("assignee")
      next.delete("label")
    })

  const orderedUsers = [...users].sort((a, b) =>
    a.name.localeCompare(b.name, "tr"),
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("gap-1.5", className)}
            aria-label={t("button")}
          >
            <HugeiconsIcon
              icon={FilterHorizontalFreeIcons as IconSvgElement}
              size={14}
              strokeWidth={2}
            />
            <span>{t("button")}</span>
            {activeCount > 0 ? (
              <span
                aria-hidden
                className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-mono text-[10px] font-medium text-primary-foreground"
              >
                {activeCount}
              </span>
            ) : null}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("scope")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={scope}
            onValueChange={(v) => setScope(v as Scope)}
          >
            <DropdownMenuRadioItem value="workspace">
              <HugeiconsIcon
                icon={UserGroupFreeIcons as IconSvgElement}
                size={13}
                strokeWidth={2}
              />
              {t("scope_workspace")}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="mine">
              <HugeiconsIcon
                icon={UserCircleFreeIcons as IconSvgElement}
                size={13}
                strokeWidth={2}
              />
              {requesterKind === "linear"
                ? t("scope_mine_linear")
                : t("scope_mine_proxy")}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <HugeiconsIcon
              icon={CircleFreeIcons as IconSvgElement}
              size={14}
              strokeWidth={2}
            />
            {t("state")}
            <span className="ml-auto text-[10px] text-muted-foreground">
              {stateFilter === "open"
                ? t("open")
                : stateFilter === "closed"
                  ? t("closed")
                  : t("all")}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-44">
            <DropdownMenuRadioGroup
              value={stateFilter}
              onValueChange={(v) => setStateFilter(v as StateFilter)}
            >
              <DropdownMenuRadioItem value="open">
                {t("open")}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="all">
                {t("all")}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="closed">
                {t("closed")}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <HugeiconsIcon
              icon={UserGroupFreeIcons as IconSvgElement}
              size={14}
              strokeWidth={2}
            />
            {t("assignee")}
            {assigneeIds.length > 0 ? (
              <span className="ml-auto rounded-md bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                {assigneeIds.length}
              </span>
            ) : null}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-80 min-w-60 overflow-y-auto">
            <DropdownMenuCheckboxItem
              checked={selectedAssignees.has(UNASSIGNED_TOKEN)}
              onClick={(e) => {
                e.preventDefault()
                toggleAssignee(UNASSIGNED_TOKEN)
              }}
            >
              <HugeiconsIcon
                icon={UserBlock01FreeIcons as IconSvgElement}
                size={13}
                strokeWidth={2}
              />
              {t("unassigned")}
            </DropdownMenuCheckboxItem>
            {orderedUsers.length === 0 ? (
              <DropdownMenuItem disabled>{t("no_users")}</DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuSeparator />
                {orderedUsers.map((u) => (
                  <DropdownMenuCheckboxItem
                    key={u.id}
                    checked={selectedAssignees.has(u.id)}
                    onClick={(e) => {
                      e.preventDefault()
                      toggleAssignee(u.id)
                    }}
                  >
                    <Avatar className="size-4">
                      {u.avatarUrl ? (
                        <AvatarImage src={u.avatarUrl} alt={u.name} />
                      ) : null}
                      <AvatarFallback className="text-[8px]">
                        {initials(u.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate">{u.name}</span>
                  </DropdownMenuCheckboxItem>
                ))}
              </>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <HugeiconsIcon
              icon={Tag01FreeIcons as IconSvgElement}
              size={14}
              strokeWidth={2}
            />
            {t("label")}
            {labelIds.length > 0 ? (
              <span className="ml-auto rounded-md bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                {labelIds.length}
              </span>
            ) : null}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-80 min-w-56 overflow-y-auto">
            {labels.length === 0 ? (
              <DropdownMenuItem disabled>{t("no_labels")}</DropdownMenuItem>
            ) : (
              renderLabelGroups(
                labels,
                selectedLabels,
                toggleLabel,
                t("no_labels_in_group"),
              )
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {activeCount > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={clearAll}>
              <HugeiconsIcon
                icon={FilterResetFreeIcons as IconSvgElement}
                size={14}
                strokeWidth={2}
              />
              {t("clear")}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
