"use client"

// Triage app/routes/inbox.tsx default component'inin client portu (PLAN §3).
// Liste verisi server page'den gelir; satır açılınca thread lazy olarak
// `${apiBase}/inbox-thread?id=…` endpoint'inden fetcher.load ile çekilir.
import { useEffect, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  ArrowDown01FreeIcons,
  ArrowRight01FreeIcons,
  LinkSquare02FreeIcons,
  InboxFreeIcons,
} from "@hugeicons/core-free-icons"

import { Link, useFetcher } from "@/lib/router-compat"
import { cn } from "@workspace/ui/lib/utils"
import { FadeIn } from "@/components/motion/fade-in"
import { TaskStatusBadge } from "@/components/tasks/task-status-badge"
import { TaskPriorityIcon } from "@/components/tasks/task-priority-icon"
import { TaskActivity } from "@/components/tasks/task-activity"
import { TaskCommentComposer } from "@/components/tasks/task-comment-composer"
import { RichTextView } from "@/components/editor/rich-text-view"
import { EmptyState } from "@/components/common/empty-state"
import { ErrorState } from "@/components/common/error-state"
import { normalizeActionResult } from "@/components/tasks/action-result"
import { useUiStore, inboxSeenKey } from "@/stores/ui-store"
import { useAutoRevalidate } from "@/hooks/use-auto-revalidate"
import { useLinearSync } from "@/hooks/use-linear-sync"
import type {
  Issue,
  IssueAttachment,
  IssueComment,
  IssueHistoryEvent,
} from "@/lib/linear/types"

type Props = {
  issues: Issue[]
  userId: string
  /** Server loader hata verdiyse true; message varsa LinearError metni. */
  failed?: boolean
  errorMessage?: string | null
}

type GroupKey = "today" | "yesterday" | "week" | "older"
type DateGroup = { key: GroupKey; issues: Issue[] }

/**
 * Talepleri (updatedAt'e göre azalan sıralı geldikleri varsayımıyla) tarih
 * kovalarına böler: Bugün / Dün / Son 7 gün / Daha eski. Boş kovalar atlanır.
 */
function groupByDate(issues: Issue[]): DateGroup[] {
  const now = new Date()
  const DAY = 86_400_000
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime()
  const startOfYesterday = startOfToday - DAY
  const startOf7 = startOfToday - 6 * DAY
  const buckets: Record<GroupKey, Issue[]> = {
    today: [],
    yesterday: [],
    week: [],
    older: [],
  }
  for (const i of issues) {
    const t = new Date(i.updatedAt).getTime()
    if (Number.isNaN(t) || t >= startOfToday) buckets.today.push(i)
    else if (t >= startOfYesterday) buckets.yesterday.push(i)
    else if (t >= startOf7) buckets.week.push(i)
    else buckets.older.push(i)
  }
  return (["today", "yesterday", "week", "older"] as GroupKey[])
    .map((key) => ({ key, issues: buckets[key] }))
    .filter((g) => g.issues.length > 0)
}

function useRelativeFormat(): (iso: string) => string {
  const t = useTranslations("linearLite.tasks.relative")
  const locale = useLocale()
  return (iso: string): string => {
    try {
      const then = new Date(iso).getTime()
      const diff = Math.max(0, (Date.now() - then) / 1000)
      if (diff < 60) return t("now")
      if (diff < 3600) return t("minutes", { count: Math.floor(diff / 60) })
      if (diff < 86400) return t("hours", { count: Math.floor(diff / 3600) })
      if (diff < 604800) return t("days", { count: Math.floor(diff / 86400) })
      return new Date(iso).toLocaleDateString(locale, {
        day: "2-digit",
        month: "short",
      })
    } catch {
      return ""
    }
  }
}

export function RequestsContent({
  issues,
  userId,
  failed = false,
  errorMessage,
}: Props) {
  const t = useTranslations("linearLite.requests")

  // Linear'da yapılan durum değişikliklerini arka planda yansıt: webhook→SSE
  // ile anlık (panel ile aynı), ayrıca 60sn güvenlik revalidate'i.
  useAutoRevalidate({ intervalMs: 60_000 })
  useLinearSync()

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:px-8">
      <FadeIn className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <HugeiconsIcon
            icon={InboxFreeIcons as IconSvgElement}
            size={22}
            strokeWidth={2}
          />
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </FadeIn>

      {!failed ? (
        issues.length > 0 ? (
          <div className="flex flex-col gap-5">
            {groupByDate(issues).map((group) => (
              <section key={group.key} className="flex flex-col gap-2">
                <h2 className="px-1 font-mono text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">
                  {t(`groups.${group.key}`)}
                </h2>
                <ul className="flex flex-col gap-2">
                  {group.issues.map((issue) => (
                    <InboxItem key={issue.id} issue={issue} userId={userId} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <EmptyState
            title={t("empty.title")}
            description={t("empty.description")}
          />
        )
      ) : (
        <ErrorState description={errorMessage || t("loadError")} />
      )}
    </div>
  )
}

/**
 * inbox-thread endpoint'inin (jsonSuccess zarfı açıldıktan sonraki) veri
 * şekli. normalizeActionResult zarfı `{ok: true, …data}` biçimine çevirir.
 */
type ThreadData = {
  ok?: boolean
  error?: string
  issue?: Issue
  cleanDescription?: string
  comments?: IssueComment[]
  history?: IssueHistoryEvent[]
  attachments?: IssueAttachment[]
}

function InboxItem({ issue, userId }: { issue: Issue; userId: string }) {
  const t = useTranslations("linearLite.requests")
  const relativeTime = useRelativeFormat()
  const [expanded, setExpanded] = useState(false)
  const fetcher = useFetcher<unknown>()
  const markInboxSeen = useUiStore((s) => s.markInboxSeen)
  const seenStateId = useUiStore(
    (s) => s.seenInboxStates[inboxSeenKey(userId, issue.id)],
  )

  // Persist hydrate olana dek SSR/ilk-render'da okunmamış göstermeyiz
  // (hydration mismatch'ten kaçınmak için).
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const unread = mounted && seenStateId !== issue.state.id

  const thread = normalizeActionResult<ThreadData>(fetcher.data)
  const loading = fetcher.state === "loading" && !thread

  const toggle = () => {
    const next = !expanded
    setExpanded(next)
    if (next) {
      // Açınca: mevcut durumda "görüldü" işaretle (okunmamışı temizler) +
      // thread'i ilk açılışta lazy yükle.
      markInboxSeen(userId, issue.id, issue.state.id)
      if (!thread && fetcher.state === "idle") {
        void fetcher.load(
          `/api/inbox-thread?id=${encodeURIComponent(issue.id)}`,
        )
      }
    }
  }

  return (
    <li
      className={cn(
        "overflow-hidden rounded-xl border bg-card/50 transition-colors",
        unread ? "border-primary/40" : "border-border/60",
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/40"
      >
        <HugeiconsIcon
          icon={
            (expanded
              ? ArrowDown01FreeIcons
              : ArrowRight01FreeIcons) as IconSvgElement
          }
          size={15}
          strokeWidth={2}
          className="shrink-0 text-muted-foreground"
        />
        <TaskPriorityIcon priority={issue.priority} />
        <span className="shrink-0 font-mono text-[10px] tracking-tight text-muted-foreground">
          {issue.identifier}
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm",
            unread ? "font-semibold text-foreground" : "text-foreground/90",
          )}
        >
          {issue.title}
        </span>
        {unread ? (
          <span
            className="size-2 shrink-0 rounded-full bg-primary"
            aria-label={t("unread")}
            title={t("unreadTitle")}
          />
        ) : null}
        <TaskStatusBadge state={issue.state} className="shrink-0" />
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground/70">
          {relativeTime(issue.updatedAt)}
        </span>
      </button>

      {expanded ? (
        <div className="border-t border-border/50 bg-background/40 px-3 py-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {issue.team?.name}
            </span>
            <Link
              to={`/tasks/${issue.id}`}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <HugeiconsIcon
                icon={LinkSquare02FreeIcons as IconSvgElement}
                size={12}
                strokeWidth={2}
              />
              {t("openDetail")}
            </Link>
          </div>

          {loading ? (
            <div className="flex flex-col gap-2">
              <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
              <div className="h-5 w-1/2 animate-pulse rounded bg-muted/70" />
            </div>
          ) : thread && thread.ok ? (
            <div className="flex flex-col gap-4">
              {thread.cleanDescription ? (
                <div className="rounded-lg border border-border/40 bg-card/40 px-3 py-2">
                  <RichTextView
                    value={thread.cleanDescription}
                    className="text-sm text-foreground/80"
                  />
                </div>
              ) : null}
              <TaskActivity
                comments={thread.comments ?? []}
                history={thread.history ?? []}
                attachments={thread.attachments ?? []}
                issueId={issue.id}
                issueIdentifier={issue.identifier}
              />
              <TaskCommentComposer issueId={issue.id} />
            </div>
          ) : thread && !thread.ok ? (
            <p className="text-sm text-destructive">{thread.error}</p>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}
