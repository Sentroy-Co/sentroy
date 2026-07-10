"use client"

// Triage app/components/tasks/task-actions-menu.tsx portu (PLAN §6).
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
  MoreHorizontalFreeIcons,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { Link, useFetcher } from "@/lib/router-compat"
import { useUiFlags } from "@/lib/ui-flags-context"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  CreateRelatedDialog,
  type RelatedKind,
} from "./create-related-dialog"
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
  align?: "start" | "end"
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
    <DropdownMenuCheckboxItem
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
                {emptyCategoryText}
              </p>
            ) : null}
          </div>
        )
      })}
    </>
  )
}

export function TaskActionsMenu({
  issue,
  states,
  labels,
  align = "end",
}: Props) {
  const fetcher = useFetcher<FetcherResult>()
  const confirm = useConfirm()
  const t = useTranslations("linearLite")
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
      if (Array.isArray(v)) for (const item of v) form.append(k, item)
      else form.set(k, v)
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
  const setPriority = (p: IssuePriority) =>
    submit({ intent: "set-priority", priority: String(p) })
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
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("tasks.menu.issueMenuAria")}
          >
            <HugeiconsIcon
              icon={MoreHorizontalFreeIcons as IconSvgElement}
              size={16}
              strokeWidth={2}
            />
          </Button>
        }
      />
      <DropdownMenuContent align={align} className="min-w-56">
        {flags.showStatus ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <HugeiconsIcon
                icon={CircleFreeIcons as IconSvgElement}
                size={14}
                strokeWidth={2}
              />
              {t("tasks.menu.status")}
              <span className="ml-auto text-[10px] text-muted-foreground">
                {issue.state.name}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-48">
              {states.length === 0 ? (
                <DropdownMenuItem disabled>—</DropdownMenuItem>
              ) : (
                states.map((s) => (
                  <DropdownMenuItem
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
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <HugeiconsIcon
              icon={AlertCircleFreeIcons as IconSvgElement}
              size={14}
              strokeWidth={2}
            />
            {t("tasks.menu.priority")}
            <span className="ml-auto text-[10px] text-muted-foreground">
              {t(`tasks.priority.${PRIORITY_META[issue.priority].labelKey}`)}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-48">
            {([0, 1, 2, 3, 4] as IssuePriority[]).map((p) => {
              const meta = PRIORITY_META[p]
              return (
                <DropdownMenuItem
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
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {flags.showLabels ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
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
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-80 min-w-56 overflow-y-auto">
              {labels.length === 0 ? (
                <DropdownMenuItem disabled>
                  {t("tasks.menu.noLabels")}
                </DropdownMenuItem>
              ) : (
                renderLabelGroups(
                  labels,
                  issue.labels,
                  toggleLabel,
                  t("tasks.menu.noLabelsInCategory"),
                )
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}

        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <HugeiconsIcon
              icon={Copy01FreeIcons as IconSvgElement}
              size={14}
              strokeWidth={2}
            />
            {t("tasks.menu.copy")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-48">
            <DropdownMenuItem
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
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => copyText(issue.title, t("tasks.menu.copiedTitle"))}
            >
              <HugeiconsIcon
                icon={TextFontFreeIcons as IconSvgElement}
                size={13}
                strokeWidth={2}
              />
              {t("tasks.menu.copyTitle")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => copyText(issue.url, t("tasks.menu.copiedUrl"))}
            >
              <HugeiconsIcon
                icon={Link01FreeIcons as IconSvgElement}
                size={13}
                strokeWidth={2}
              />
              {t("tasks.menu.copyUrl")}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {flags.showLinkedIssues ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <HugeiconsIcon
                icon={PlusSignFreeIcons as IconSvgElement}
                size={14}
                strokeWidth={2}
              />
              {t("tasks.menu.createLinked")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-52">
              <DropdownMenuItem
                render={
                  <Link
                    to={`/tasks/new?parentId=${encodeURIComponent(issue.id)}`}
                  />
                }
              >
                <HugeiconsIcon
                  icon={ArrowDownRight01FreeIcons as IconSvgElement}
                  size={13}
                  strokeWidth={2}
                />
                {t("tasks.menu.subTaskNewForm")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {RELATED_OPTIONS.filter((o) => o.kind !== "sub").map((opt) => (
                <DropdownMenuItem
                  key={opt.kind}
                  onClick={() => setCreateKind(opt.kind)}
                >
                  <HugeiconsIcon icon={opt.icon} size={13} strokeWidth={2} />
                  {t(`tasks.related.${opt.labelKey}`)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}

        {flags.showArchive ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={archive}>
              <HugeiconsIcon
                icon={Delete02FreeIcons as IconSvgElement}
                size={14}
                strokeWidth={2}
              />
              {t("tasks.menu.archive")}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>

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
    </DropdownMenu>
  )
}
