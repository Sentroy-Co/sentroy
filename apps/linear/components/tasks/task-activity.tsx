"use client"

// Triage app/components/tasks/task-activity.tsx portu (PLAN §6).
// AI assist yoktu; _ICONS re-export'u temizlendi.
import { useEffect, useMemo, useRef, useState } from "react"
import { motion } from "framer-motion"
import { useLocale, useTranslations } from "next-intl"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  CircleFreeIcons,
  UserFreeIcons,
  AlertCircleFreeIcons,
  Tag01FreeIcons,
  Edit02FreeIcons,
  Archive02FreeIcons,
  Link01FreeIcons,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { Link, useFetcher } from "@/lib/router-compat"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { RichTextView } from "@/components/editor/rich-text-view"
import {
  RichTextEditor,
  type RichTextEditorHandle,
} from "@/components/editor/rich-text-editor"
import { MorphButton } from "@/components/motion/morph-button"
import { CommentContextMenu } from "./comment-context-menu"
import { CommentActionsMenu } from "./comment-actions-menu"
import { TaskCommentComposer } from "./task-comment-composer"
import { normalizeActionResult, type FetcherResult } from "./action-result"
import { useReducedMotion } from "@/hooks/use-reduced-motion"
import { useConfirm } from "@/components/common/confirm-dialog"
import type {
  IssueAttachment,
  IssueComment,
  IssueHistoryEvent,
  IssuePriority,
  IssueUser,
} from "@/lib/linear/types"

type TimelineEntry =
  | { kind: "comment"; key: string; createdAt: string; comment: IssueComment }
  | {
      kind: "history"
      key: string
      createdAt: string
      history: IssueHistoryEvent
    }
  | {
      kind: "attachment"
      key: string
      createdAt: string
      attachment: IssueAttachment
    }

type Props = {
  comments: IssueComment[]
  history: IssueHistoryEvent[]
  attachments: IssueAttachment[]
  issueId: string
  issueIdentifier?: string
}

type Translator = ReturnType<typeof useTranslations>

const PRIORITY_KEY: Record<IssuePriority, string> = {
  0: "no_priority",
  1: "urgent",
  2: "high",
  3: "medium",
  4: "low",
}

function userInitials(u: IssueUser | null): string {
  if (!u) return "?"
  const src = (u.name && u.name.trim()) || u.email?.split("@")[0] || "?"
  return src
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("")
}

function formatDate(value: string, locale: string): string {
  try {
    return new Date(value).toLocaleString(locale, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return value
  }
}

function firstLine(body: string, max = 80): string {
  const cleaned = body.replace(/\s+/g, " ").trim()
  if (cleaned.length <= max) return cleaned
  return cleaned.slice(0, max).trimEnd() + "…"
}

function userFilterHref(userId: string): string {
  return `/?scope=workspace&assignee=${encodeURIComponent(userId)}`
}

function UserNameLink({
  user,
  className,
  fallback,
}: {
  user: IssueUser | null | undefined
  className?: string
  fallback?: string
}) {
  const t = useTranslations("linearLite")
  if (!user) {
    return (
      <strong className={cn("font-medium text-foreground", className)}>
        {fallback ?? t("tasks.activity.system")}
      </strong>
    )
  }
  return (
    <Link
      to={userFilterHref(user.id)}
      className={cn(
        "font-medium text-foreground transition-colors hover:text-primary hover:underline underline-offset-2 decoration-dotted",
        className,
      )}
      title={t("tasks.activity.filterByUser", { name: user.name })}
    >
      {user.name}
    </Link>
  )
}

export function TaskActivity({
  comments,
  history,
  attachments,
  issueId,
  issueIdentifier,
}: Props) {
  const reduce = useReducedMotion()
  const t = useTranslations("linearLite")

  // Threaded yorumlar: parentId ile böl, render'da geri birleştir
  const { rootComments, childrenByParent } = useMemo(() => {
    const cMap = new Map(comments.map((c) => [c.id, c]))
    const children = new Map<string, IssueComment[]>()
    const roots: IssueComment[] = []
    for (const c of comments) {
      if (c.parentId && cMap.has(c.parentId)) {
        const arr = children.get(c.parentId) ?? []
        arr.push(c)
        children.set(c.parentId, arr)
      } else {
        roots.push(c)
      }
    }
    return { rootComments: roots, childrenByParent: children }
  }, [comments])

  // Timeline'a sadece root yorumlar girer (yanıtlar parent'larının altına)
  const timeline: TimelineEntry[] = [
    ...rootComments.map(
      (c): TimelineEntry => ({
        kind: "comment",
        key: `c:${c.id}`,
        createdAt: c.createdAt,
        comment: c,
      }),
    ),
    ...attachments.map(
      (a): TimelineEntry => ({
        kind: "attachment",
        key: `a:${a.id}`,
        createdAt: a.createdAt,
        attachment: a,
      }),
    ),
    ...history
      .filter((h) => describeHistory(h, t) !== null)
      .map(
        (h): TimelineEntry => ({
          kind: "history",
          key: `h:${h.id}`,
          createdAt: h.createdAt,
          history: h,
        }),
      ),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  if (timeline.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {t("tasks.detail.noActivity")}
      </p>
    )
  }

  return (
    <ol className="flex flex-col gap-1.5">
      {timeline.map((entry, i) => (
        <motion.li
          key={entry.key}
          initial={reduce ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: reduce ? 0 : 0.18,
            delay: reduce ? 0 : Math.min(i * 0.02, 0.2),
          }}
          className="flex flex-col gap-1.5"
        >
          {entry.kind === "comment" ? (
            <CommentThread
              comment={entry.comment}
              childrenByParent={childrenByParent}
              sourceIssueId={issueId}
              sourceIdentifier={issueIdentifier}
              rootCommentId={entry.comment.id}
              depth={0}
            />
          ) : entry.kind === "attachment" ? (
            <AttachmentRow attachment={entry.attachment} />
          ) : (
            <HistoryRow event={entry.history} />
          )}
        </motion.li>
      ))}
    </ol>
  )
}

function CommentThread({
  comment,
  childrenByParent,
  sourceIssueId,
  sourceIdentifier,
  rootCommentId,
  depth,
}: {
  comment: IssueComment
  childrenByParent: Map<string, IssueComment[]>
  sourceIssueId: string
  sourceIdentifier?: string
  // Linear yorum threading'i düz (1 seviye): tüm yanıtlar orijinal root
  // yoruma pinlenir. rootCommentId'yi aşağı taşırız ki alt-yorumdaki "yanıt"
  // aynı root altına post edilsin.
  rootCommentId: string
  depth: number
}) {
  const replies = childrenByParent.get(comment.id) ?? []
  const indentClass =
    depth === 0 ? "" : "ml-6 border-l-2 border-border/50 pl-3"
  return (
    <div className={cn("flex flex-col gap-1.5", indentClass)}>
      <EditableComment
        comment={comment}
        sourceIssueId={sourceIssueId}
        sourceIdentifier={sourceIdentifier}
        replyTargetId={rootCommentId}
      />
      {replies.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {replies.map((reply) => (
            <CommentThread
              key={reply.id}
              comment={reply}
              childrenByParent={childrenByParent}
              sourceIssueId={sourceIssueId}
              sourceIdentifier={sourceIdentifier}
              rootCommentId={rootCommentId}
              depth={depth + 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function EditableComment({
  comment,
  sourceIssueId,
  sourceIdentifier,
  replyTargetId,
}: {
  comment: IssueComment
  sourceIssueId: string
  sourceIdentifier?: string
  replyTargetId: string
}) {
  const t = useTranslations("linearLite")
  const fetcher = useFetcher<FetcherResult>()
  const editorRef = useRef<RichTextEditorHandle>(null)
  const confirm = useConfirm()
  const [editing, setEditing] = useState(false)
  const [replying, setReplying] = useState(false)
  const [body, setBody] = useState(comment.body)
  const submitting = fetcher.state !== "idle"

  useEffect(() => {
    if (!editing) setBody(comment.body)
  }, [comment.body, editing])

  useEffect(() => {
    if (submitting) return
    const data = normalizeActionResult<FetcherResult>(fetcher.data)
    if (!data) return
    if (data.ok) {
      toast.success(t("common.updated"))
      setEditing(false)
    } else if (data.error) {
      toast.error(data.error)
    }
  }, [submitting, fetcher.data, t])

  const onSave = () => {
    if (!body.trim()) {
      toast.error(t("tasks.comments.emptyError"))
      return
    }
    const form = new FormData()
    form.set("intent", "edit-comment")
    form.set("commentId", comment.id)
    form.set("body", body)
    void fetcher.submit(form, {
      method: "post",
      action: `/tasks/${sourceIssueId}`,
    })
  }

  const onDelete = async () => {
    const ok = await confirm({
      title: t("tasks.comments.deleteTitle"),
      description: t("tasks.comments.deleteDesc"),
      confirmLabel: t("common.delete"),
      variant: "destructive",
    })
    if (!ok) return
    const form = new FormData()
    form.set("intent", "delete-comment")
    form.set("commentId", comment.id)
    void fetcher.submit(form, {
      method: "post",
      action: `/tasks/${sourceIssueId}`,
    })
  }

  if (editing) {
    return (
      <div className="flex w-full flex-col gap-2 rounded-lg border border-border bg-card px-3 py-2 ring-2 ring-ring/15">
        <RichTextEditor
          ref={editorRef}
          value={body}
          onChange={setBody}
          onSubmit={onSave}
          minHeight={64}
          maxHeight={280}
          contentClassName="text-sm"
          autoFocus
        />
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={submitting}
            onClick={() => {
              setBody(comment.body)
              setEditing(false)
            }}
          >
            {t("common.cancel")}
          </Button>
          <MorphButton
            submitting={submitting}
            type="button"
            size="sm"
            onClick={onSave}
          >
            {t("common.save")}
          </MorphButton>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <CommentContextMenu
        comment={comment}
        sourceIssueId={sourceIssueId}
        sourceIdentifier={sourceIdentifier}
        onEdit={() => {
          setBody(comment.body)
          setEditing(true)
          setTimeout(() => editorRef.current?.focus(), 50)
        }}
        onDelete={onDelete}
      >
        <CommentRow
          comment={comment}
          actions={
            <CommentActionsMenu
              comment={comment}
              sourceIssueId={sourceIssueId}
              sourceIdentifier={sourceIdentifier}
              onReply={() => setReplying(true)}
              onEdit={() => {
                setBody(comment.body)
                setEditing(true)
                setTimeout(() => editorRef.current?.focus(), 50)
              }}
              onDelete={onDelete}
              className="opacity-0 transition-opacity duration-150 group-hover/c:opacity-100 data-[state=open]:opacity-100"
            />
          }
        />
      </CommentContextMenu>
      {replying ? (
        <div className="ml-7 border-l-2 border-border/60 pl-3">
          <TaskCommentComposer
            issueId={sourceIssueId}
            parentCommentId={replyTargetId}
            parentPreview={firstLine(comment.body)}
            onCancel={() => setReplying(false)}
            autoFocus
          />
        </div>
      ) : null}
    </div>
  )
}

function CommentRow({
  comment,
  actions,
}: {
  comment: IssueComment
  actions?: React.ReactNode
}) {
  const t = useTranslations("linearLite")
  const locale = useLocale()
  const avatar = (
    <Avatar className="size-6 mt-0.5">
      {comment.user?.avatarUrl ? (
        <AvatarImage src={comment.user.avatarUrl} alt={comment.user.name} />
      ) : null}
      <AvatarFallback className="text-[9px]">
        {userInitials(comment.user)}
      </AvatarFallback>
    </Avatar>
  )
  return (
    <div className="group/c flex w-full gap-2.5 rounded-lg border border-border/50 bg-card/60 px-2.5 py-2 transition-colors hover:border-border hover:bg-card">
      {comment.user ? (
        <Link
          to={userFilterHref(comment.user.id)}
          aria-label={t("tasks.activity.filterAvatarAria", {
            name: comment.user.name,
          })}
          className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {avatar}
        </Link>
      ) : (
        avatar
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2 text-[11px]">
          <UserNameLink
            user={comment.user}
            fallback={t("tasks.comments.unknown")}
          />
          <span className="text-muted-foreground">
            {formatDate(comment.createdAt, locale)}
          </span>
        </div>
        <RichTextView value={comment.body} className="text-sm" />
      </div>
      {actions ? <div className="ml-1 self-start">{actions}</div> : null}
    </div>
  )
}

function AttachmentRow({ attachment }: { attachment: IssueAttachment }) {
  const t = useTranslations("linearLite")
  const locale = useLocale()
  return (
    <div className="flex w-full items-start gap-2.5 px-1 py-0.5 text-xs">
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background text-muted-foreground">
        <HugeiconsIcon
          icon={Link01FreeIcons as IconSvgElement}
          size={10}
          strokeWidth={2}
        />
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0">
        <UserNameLink user={attachment.creator} />
        <span className="text-muted-foreground">
          {t("tasks.activity.addedLink")}
        </span>
        <a
          href={attachment.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex max-w-[40ch] items-center gap-1 truncate text-foreground hover:underline"
        >
          <span className="truncate font-medium">{attachment.title}</span>
          {attachment.subtitle ? (
            <span className="truncate text-muted-foreground">
              · {attachment.subtitle}
            </span>
          ) : null}
        </a>
        <span className="text-muted-foreground/80">
          · {formatDate(attachment.createdAt, locale)}
        </span>
      </div>
    </div>
  )
}

type HistoryDescription = {
  icon: IconSvgElement
  body: React.ReactNode
}

function describeHistory(
  e: IssueHistoryEvent,
  t: Translator,
): HistoryDescription | null {
  if (e.toState && e.fromState && e.toState.id !== e.fromState.id) {
    return {
      icon: CircleFreeIcons as IconSvgElement,
      body: (
        <>
          {t("tasks.activity.historyStatus")}{" "}
          <Pill swatch={e.fromState.color}>{e.fromState.name}</Pill>
          {" → "}
          <Pill swatch={e.toState.color}>{e.toState.name}</Pill>
        </>
      ),
    }
  }
  if (
    e.toAssignee &&
    (!e.fromAssignee || e.fromAssignee.id !== e.toAssignee.id)
  ) {
    const assignee = e.toAssignee
    return {
      icon: UserFreeIcons as IconSvgElement,
      body: (
        <>
          {t.rich("tasks.activity.historyAssigned", {
            user: () => <UserNameLink user={assignee} />,
          })}
        </>
      ),
    }
  }
  if (e.fromAssignee && !e.toAssignee) {
    return {
      icon: UserFreeIcons as IconSvgElement,
      body: <>{t("tasks.activity.historyUnassigned")}</>,
    }
  }
  if (e.toPriority !== null && e.fromPriority !== e.toPriority) {
    return {
      icon: AlertCircleFreeIcons as IconSvgElement,
      body: (
        <>
          {t("tasks.activity.historyPriority")}{" "}
          <strong className="font-medium text-foreground">
            {t(`tasks.priority.${PRIORITY_KEY[e.toPriority as IssuePriority]}`)}
          </strong>
        </>
      ),
    }
  }
  if (e.addedLabels.length > 0 || e.removedLabels.length > 0) {
    return {
      icon: Tag01FreeIcons as IconSvgElement,
      body: (
        <>
          {e.addedLabels.length > 0
            ? t.rich("tasks.activity.historyLabelsAdded", {
                labels: () => (
                  <>
                    {e.addedLabels.map((l) => (
                      <Pill key={l.id} swatch={l.color}>
                        {l.name}
                      </Pill>
                    ))}
                  </>
                ),
              })
            : null}
          {e.addedLabels.length > 0 && e.removedLabels.length > 0 ? "; " : null}
          {e.removedLabels.length > 0
            ? t.rich("tasks.activity.historyLabelsRemoved", {
                labels: () => (
                  <>
                    {e.removedLabels.map((l) => (
                      <Pill key={l.id} swatch={l.color}>
                        {l.name}
                      </Pill>
                    ))}
                  </>
                ),
              })
            : null}
        </>
      ),
    }
  }
  if (e.toTitle && e.fromTitle && e.toTitle !== e.fromTitle) {
    return {
      icon: Edit02FreeIcons as IconSvgElement,
      body: <>{t("tasks.activity.historyTitleEdited")}</>,
    }
  }
  if (e.archived === true) {
    return {
      icon: Archive02FreeIcons as IconSvgElement,
      body: <>{t("tasks.activity.historyArchived")}</>,
    }
  }
  if (e.archived === false) {
    return {
      icon: Archive02FreeIcons as IconSvgElement,
      body: <>{t("tasks.activity.historyUnarchived")}</>,
    }
  }
  return null
}

function HistoryRow({ event }: { event: IssueHistoryEvent }) {
  const t = useTranslations("linearLite")
  const locale = useLocale()
  const desc = describeHistory(event, t)
  if (!desc) return null
  return (
    <div className="flex w-full items-center gap-2.5 px-1 py-0.5 text-xs text-muted-foreground">
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background">
        <HugeiconsIcon icon={desc.icon} size={10} strokeWidth={2} />
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0">
        <UserNameLink user={event.actor} />
        <span className="inline-flex flex-wrap items-center gap-1">
          {desc.body}
        </span>
        <span className="text-muted-foreground/80">
          · {formatDate(event.createdAt, locale)}
        </span>
      </div>
    </div>
  )
}

function Pill({
  swatch,
  children,
}: {
  swatch?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border/40 bg-muted/40 px-1.5 py-0.5 text-[10px] text-foreground",
      )}
    >
      {swatch ? (
        <span
          className="size-1.5 rounded-full"
          style={{ backgroundColor: swatch }}
        />
      ) : null}
      {children}
    </span>
  )
}
