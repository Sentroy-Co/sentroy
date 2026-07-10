"use client"

// Triage app/components/tasks/task-hover-card.tsx portu (PLAN §6).
// PreviewResult tipi triage'da route loader'ından türetiliyordu; burada
// api/issue-preview endpoint'inin payload'ı lokal olarak tanımlandı.
import { useRef } from "react"
import { useLocale, useTranslations } from "next-intl"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  Tag01FreeIcons,
  Comment01FreeIcons,
  Attachment01FreeIcons,
  ArrowDownRight01FreeIcons,
} from "@hugeicons/core-free-icons"

import { Link, useFetcher } from "@/lib/router-compat"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { TaskPriorityIcon } from "./task-priority-icon"
import { TaskStatusBadge } from "./task-status-badge"
import { normalizeActionResult } from "./action-result"
import type { Issue, IssueUser } from "@/lib/linear/types"

type Props = {
  issueId: string
  children: React.ReactNode
}

type PreviewIssue = Pick<
  Issue,
  | "id"
  | "identifier"
  | "title"
  | "url"
  | "priority"
  | "state"
  | "team"
  | "creator"
  | "assignee"
  | "labels"
  | "createdAt"
  | "updatedAt"
>

type PreviewComment = {
  id: string
  body: string
  createdAt: string
  user: IssueUser | null
}

type PreviewResult =
  | {
      ok: true
      issue: PreviewIssue
      descriptionPreview: string
      lastComment: PreviewComment | null
      counts: { comments: number; attachments: number; children: number }
    }
  | { ok: false; error?: string }

function initials(name?: string | null): string {
  if (!name) return "?"
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("")
}

/**
 * Hover'da bir tick (≈350 ms) sonra preview popover'ı açar; içerikteki
 * sub-resource'ları (description preview, son yorum, count'lar) lazy
 * fetch eder. Popover içinde tıklayınca task detay sayfasına gider.
 *
 * Base UI Popover'ın openOnHover desteğiyle çalışır — manuel timer
 * gerekmez; mouse popover'a girince kapanmaz, kart + popover ortak
 * "hover graph"ı tarar.
 */
export function TaskHoverCard({ issueId, children }: Props) {
  const fetcher = useFetcher<unknown>()
  const requestedRef = useRef(false)

  return (
    <Popover
      onOpenChange={(open) => {
        if (open && !requestedRef.current) {
          void fetcher.load(
            `/api/issue-preview?id=${encodeURIComponent(issueId)}`,
          )
          requestedRef.current = true
        }
      }}
    >
      <PopoverTrigger
        openOnHover
        delay={350}
        closeDelay={120}
        render={<div className="block w-full" />}
      >
        {children}
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        alignOffset={-4}
        sideOffset={10}
        className="w-80 gap-3 p-4"
      >
        <Body
          data={normalizeActionResult<PreviewResult>(fetcher.data)}
          loading={fetcher.state === "loading"}
        />
      </PopoverContent>
    </Popover>
  )
}

function Body({
  data,
  loading,
}: {
  data: PreviewResult | undefined
  loading: boolean
}) {
  const t = useTranslations("linearLite")
  const locale = useLocale()

  const formatRelative = (value: string): string => {
    try {
      const d = new Date(value)
      const diffMs = Date.now() - d.getTime()
      const minute = 60_000
      const hour = 60 * minute
      const day = 24 * hour
      if (diffMs < minute) return t("tasks.hover.relativeNow")
      if (diffMs < hour)
        return t("tasks.hover.relativeMinutes", {
          n: Math.floor(diffMs / minute),
        })
      if (diffMs < day)
        return t("tasks.hover.relativeHours", { n: Math.floor(diffMs / hour) })
      if (diffMs < 30 * day)
        return t("tasks.hover.relativeDays", { n: Math.floor(diffMs / day) })
      return d.toLocaleDateString(locale)
    } catch {
      return ""
    }
  }

  if (!data || (loading && !data.ok)) {
    return (
      <div className="flex flex-col gap-2">
        <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
        <div className="h-4 w-full animate-pulse rounded bg-muted" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-muted/70" />
      </div>
    )
  }
  if (!data.ok) {
    return (
      <p className="text-xs text-destructive">
        {data.error ?? t("tasks.hover.previewError")}
      </p>
    )
  }
  const { issue, descriptionPreview, lastComment, counts } = data
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <TaskPriorityIcon priority={issue.priority} />
        <span className="font-mono tracking-tight">{issue.identifier}</span>
        <span>·</span>
        <span>{issue.team.name}</span>
        <span className="ml-auto">{formatRelative(issue.updatedAt)}</span>
      </div>
      <Link
        to={`/tasks/${issue.id}`}
        className="line-clamp-2 text-sm font-medium leading-snug text-foreground hover:underline"
      >
        {issue.title}
      </Link>

      <div className="flex flex-wrap items-center gap-1.5">
        <TaskStatusBadge state={issue.state} />
        {issue.assignee ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border/40 bg-muted/40 px-1.5 py-0.5 text-[10px]">
            <Avatar className="size-3.5">
              {issue.assignee.avatarUrl ? (
                <AvatarImage
                  src={issue.assignee.avatarUrl}
                  alt={issue.assignee.name}
                />
              ) : null}
              <AvatarFallback className="text-[7px]">
                {initials(issue.assignee.name)}
              </AvatarFallback>
            </Avatar>
            {issue.assignee.name}
          </span>
        ) : null}
        {issue.labels.slice(0, 3).map((l) => (
          <span
            key={l.id}
            className="inline-flex items-center gap-1 rounded-md border border-border/40 bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
          >
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: l.color }}
              aria-hidden
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

      {descriptionPreview ? (
        <p className="line-clamp-3 text-xs text-muted-foreground leading-relaxed">
          {descriptionPreview}
        </p>
      ) : null}

      {lastComment ? (
        <div className="flex items-start gap-2 rounded-md border border-border/40 bg-muted/20 p-2">
          <Avatar className="size-5 mt-0.5">
            {lastComment.user?.avatarUrl ? (
              <AvatarImage
                src={lastComment.user.avatarUrl}
                alt={lastComment.user.name}
              />
            ) : null}
            <AvatarFallback className="text-[8px]">
              {initials(lastComment.user?.name ?? null)}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="font-medium text-foreground">
                {lastComment.user?.name ?? "—"}
              </span>
              <span>·</span>
              <span>{formatRelative(lastComment.createdAt)}</span>
            </div>
            <p className="line-clamp-2 text-[11px] text-muted-foreground/90">
              {lastComment.body}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-3 text-[10px] text-muted-foreground/80">
        {counts.comments > 0 ? (
          <span className="inline-flex items-center gap-1">
            <HugeiconsIcon
              icon={Comment01FreeIcons as IconSvgElement}
              size={11}
              strokeWidth={2}
            />
            {counts.comments}
          </span>
        ) : null}
        {counts.attachments > 0 ? (
          <span className="inline-flex items-center gap-1">
            <HugeiconsIcon
              icon={Attachment01FreeIcons as IconSvgElement}
              size={11}
              strokeWidth={2}
            />
            {counts.attachments}
          </span>
        ) : null}
        {counts.children > 0 ? (
          <span className="inline-flex items-center gap-1">
            <HugeiconsIcon
              icon={ArrowDownRight01FreeIcons as IconSvgElement}
              size={11}
              strokeWidth={2}
            />
            {counts.children}
          </span>
        ) : null}
      </div>
    </div>
  )
}
