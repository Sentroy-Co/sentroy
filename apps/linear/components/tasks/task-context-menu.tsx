"use client"

// Triage app/components/tasks/task-context-menu.tsx portu (PLAN §6).
import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  CircleFreeIcons,
  AlertCircleFreeIcons,
  Tag01FreeIcons,
  Copy01FreeIcons,
  Link01FreeIcons,
  Delete02FreeIcons,
  TextFontFreeIcons,
  LinkSquare02FreeIcons,
  ArrowUp02FreeIcons,
  ArrowDown02FreeIcons,
  Menu02FreeIcons,
  MinusSignFreeIcons,
  PlusSignFreeIcons,
  TaskAdd01FreeIcons,
  ArrowDownRight01FreeIcons,
  ArrowUpLeft01FreeIcons,
  CancelCircleFreeIcons,
  MinusSignCircleFreeIcons,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { useFetcher } from "@/lib/router-compat"
import { useUiFlags } from "@/lib/ui-flags-context"
import {
  CreateRelatedDialog,
  type RelatedKind,
} from "./create-related-dialog"
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@workspace/ui/components/context-menu"
import { normalizeActionResult, type FetcherResult } from "./action-result"
import { useConfirm } from "@/components/common/confirm-dialog"
import type {
  Issue,
  IssueLabel,
  IssuePriority,
  IssueState,
} from "@/lib/linear/types"

type Props = {
  issue: Issue
  states: IssueState[]
  labels: IssueLabel[]
  children: React.ReactNode
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

function renderLabelGroups(
  all: IssueLabel[],
  selected: IssueLabel[],
  onToggle: (id: string) => void,
  emptyCategoryText: string,
): React.ReactNode {
  const selectedIds = new Set(selected.map((l) => l.id))
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
    <ContextMenuCheckboxItem
      key={l.id}
      checked={selectedIds.has(l.id)}
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
    </ContextMenuCheckboxItem>
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
                {emptyCategoryText}
              </p>
            ) : null}
          </div>
        )
      })}
    </>
  )
}

const RELATED_OPTIONS: {
  kind: RelatedKind
  labelKey: string
  icon: IconSvgElement
}[] = [
  {
    kind: "issue",
    labelKey: "issue",
    icon: TaskAdd01FreeIcons as IconSvgElement,
  },
  {
    kind: "sub",
    labelKey: "sub",
    icon: ArrowDownRight01FreeIcons as IconSvgElement,
  },
  {
    kind: "parent",
    labelKey: "parent",
    icon: ArrowUpLeft01FreeIcons as IconSvgElement,
  },
  {
    kind: "blocking",
    labelKey: "blocking",
    icon: MinusSignCircleFreeIcons as IconSvgElement,
  },
  {
    kind: "blocked",
    labelKey: "blocked",
    icon: CancelCircleFreeIcons as IconSvgElement,
  },
  {
    kind: "related",
    labelKey: "related",
    icon: LinkSquare02FreeIcons as IconSvgElement,
  },
]

export function TaskContextMenu({
  issue,
  states,
  labels,
  children,
}: Props) {
  const fetcher = useFetcher<FetcherResult>()
  const t = useTranslations("linearLite")
  const confirm = useConfirm()
  const flags = useUiFlags()
  const [createKind, setCreateKind] = useState<RelatedKind | null>(null)

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
      if (Array.isArray(v)) {
        for (const item of v) form.append(k, item)
      } else {
        form.set(k, v)
      }
    }
    void fetcher.submit(form, { method: "post" })
  }

  const copyText = async (text: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(msg)
    } catch {
      toast.error(t("tasks.menu.clipboardError"))
    }
  }

  const setState = (stateId: string) => submit({ intent: "move", stateId })
  const setPriority = (priority: IssuePriority) =>
    submit({ intent: "set-priority", priority: String(priority) })
  const toggleLabel = (labelId: string) => {
    const current = new Set(issue.labels.map((l) => l.id))
    if (current.has(labelId)) current.delete(labelId)
    else current.add(labelId)
    submit({ intent: "set-labels", labelIds: Array.from(current) })
  }
  const archive = async () => {
    const ok = await confirm({
      title: t("tasks.menu.archiveConfirmTitle", {
        identifier: issue.identifier,
      }),
      description: t("tasks.menu.archiveConfirmDesc"),
      confirmLabel: t("tasks.menu.archive"),
      variant: "destructive",
    })
    if (!ok) return
    submit({ intent: "archive" })
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-56">
        {flags.showStatus ? (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <HugeiconsIcon
                icon={CircleFreeIcons as IconSvgElement}
                size={14}
                strokeWidth={2}
              />
              {t("tasks.menu.status")}
              <span className="ml-auto text-[10px] text-muted-foreground">
                {issue.state.name}
              </span>
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="min-w-48">
              {states.length === 0 ? (
                <ContextMenuItem disabled>—</ContextMenuItem>
              ) : (
                states.map((s) => (
                  <ContextMenuItem
                    key={s.id}
                    onClick={() => setState(s.id)}
                    data-checked={s.id === issue.state.id}
                  >
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: s.color }}
                      aria-hidden
                    />
                    {s.name}
                  </ContextMenuItem>
                ))
              )}
            </ContextMenuSubContent>
          </ContextMenuSub>
        ) : null}

        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <HugeiconsIcon
              icon={AlertCircleFreeIcons as IconSvgElement}
              size={14}
              strokeWidth={2}
            />
            {t("tasks.menu.priority")}
            <span className="ml-auto text-[10px] text-muted-foreground">
              {t(`tasks.priority.${PRIORITY_META[issue.priority].labelKey}`)}
            </span>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="min-w-48">
            {([0, 1, 2, 3, 4] as IssuePriority[]).map((p) => {
              const meta = PRIORITY_META[p]
              return (
                <ContextMenuItem
                  key={p}
                  onClick={() => setPriority(p)}
                  data-checked={p === issue.priority}
                >
                  <HugeiconsIcon
                    icon={meta.icon}
                    size={13}
                    strokeWidth={2}
                    style={{ color: meta.swatch }}
                  />
                  {t(`tasks.priority.${meta.labelKey}`)}
                </ContextMenuItem>
              )
            })}
          </ContextMenuSubContent>
        </ContextMenuSub>

        {flags.showLabels ? (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <HugeiconsIcon
                icon={Tag01FreeIcons as IconSvgElement}
                size={14}
                strokeWidth={2}
              />
              {t("tasks.menu.labels")}
              {issue.labels.length > 0 ? (
                <span className="ml-auto rounded-md bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {issue.labels.length}
                </span>
              ) : null}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="max-h-80 min-w-56 overflow-y-auto">
              {labels.length === 0 ? (
                <ContextMenuItem disabled>
                  {t("tasks.menu.noLabels")}
                </ContextMenuItem>
              ) : (
                renderLabelGroups(
                  labels,
                  issue.labels,
                  toggleLabel,
                  t("tasks.menu.noLabelsInCategory"),
                )
              )}
            </ContextMenuSubContent>
          </ContextMenuSub>
        ) : null}

        <ContextMenuSeparator />

        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <HugeiconsIcon
              icon={Copy01FreeIcons as IconSvgElement}
              size={14}
              strokeWidth={2}
            />
            {t("tasks.menu.copy")}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="min-w-48">
            <ContextMenuItem
              onClick={() =>
                copyText(issue.identifier, t("tasks.menu.copiedIdentifier"))
              }
            >
              <HugeiconsIcon
                icon={TextFontFreeIcons as IconSvgElement}
                size={13}
                strokeWidth={2}
              />
              {t("tasks.menu.copyIdentifier")}{" "}
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                {issue.identifier}
              </span>
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => copyText(issue.title, t("tasks.menu.copiedTitle"))}
            >
              <HugeiconsIcon
                icon={TextFontFreeIcons as IconSvgElement}
                size={13}
                strokeWidth={2}
              />
              {t("tasks.menu.copyTitle")}
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => copyText(issue.url, t("tasks.menu.copiedUrl"))}
            >
              <HugeiconsIcon
                icon={Link01FreeIcons as IconSvgElement}
                size={13}
                strokeWidth={2}
              />
              {t("tasks.menu.copyUrl")}
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        {flags.showLinkedIssues ? (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <HugeiconsIcon
                icon={PlusSignFreeIcons as IconSvgElement}
                size={14}
                strokeWidth={2}
              />
              {t("tasks.menu.createLinked")}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="min-w-52">
              {RELATED_OPTIONS.map((opt) => (
                <ContextMenuItem
                  key={opt.kind}
                  onClick={() => setCreateKind(opt.kind)}
                >
                  <HugeiconsIcon
                    icon={opt.icon}
                    size={13}
                    strokeWidth={2}
                  />
                  {t(`tasks.related.${opt.labelKey}`)}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        ) : null}

        {flags.showArchive ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onClick={archive}>
              <HugeiconsIcon
                icon={Delete02FreeIcons as IconSvgElement}
                size={14}
                strokeWidth={2}
              />
              {t("tasks.menu.archive")}
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenuContent>

      <CreateRelatedDialog
        open={createKind !== null}
        onOpenChange={(v) => {
          if (!v) setCreateKind(null)
        }}
        kind={createKind ?? "issue"}
        sourceIssueId={issue.id}
        sourceIdentifier={issue.identifier}
        action={`/tasks/${issue.id}`}
      />
    </ContextMenu>
  )
}
