"use client"

import { type ReactNode, useMemo, useState, useCallback } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { formatDistanceToNow } from "date-fns"
import { motion } from "framer-motion"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Comment01Icon,
  RepeatIcon,
  Delete02Icon,
  MoreHorizontalIcon,
  Link01Icon,
} from "@hugeicons/core-free-icons"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { sanitizeHtml } from "@workspace/console/lib/sanitize-html"
import { confirm } from "@workspace/console/stores/confirm"
import { LinkPreview } from "@workspace/console/components/social/link-preview"
import {
  ReactionPicker,
  type ReactionKey,
} from "@workspace/console/components/social/reaction-picker"

export interface PostCardAuthor {
  id: string
  name: string
  email?: string
  image?: string | null
  profileSlug?: string | null
  /** Şirketteki rol (owner/admin/member) — isim yanında badge. */
  role?: string | null
}

export interface PostCardData {
  id: string
  text: string
  /** TipTap zengin HTML (sanitize edilmiş). Varsa düz `text` yerine render
   *  edilir; eski postlarda null → linkify(text) fallback. */
  bodyHtml?: string | null
  attachments: Array<{
    url: string
    width?: number
    height?: number
  }>
  createdAt: string | Date
  commentCount: number
  reactionCount: number
  repostCount: number
  deletedAt?: string | Date | null
  author: PostCardAuthor | null
  /** Owning company id — passed through from the hydrated payload so
   *  callers can resolve detail routes when a slug isn't already on
   *  the URL. */
  companyId?: string
  companySlug?: string | null
  repostOfPost?: (Omit<PostCardData, "repostOfPost"> & {
    author: PostCardAuthor | null
  }) | null
  reactionCounts: Partial<Record<ReactionKey, number>>
  viewerReaction: ReactionKey | null
}

interface PostCardProps {
  post: PostCardData
  /** When provided, controls navigation to the detail page; otherwise
   *  the card is non-clickable. Locale + company slug are injected here
   *  to avoid threading them through every list. */
  hrefDetail?: string
  /** Profile slug → /[lang]/profile/u/<slug>. Falls back to author name
   *  text if no slug exists. */
  authorHrefBase?: string
  viewerId?: string | null
  /** Toggle a reaction on this post. Returns new count map; the card
   *  also optimistically updates its local reaction state. */
  onToggleReaction?: (
    postId: string,
    key: ReactionKey,
  ) => Promise<{
    counts: Partial<Record<ReactionKey, number>>
    viewerReaction: ReactionKey | null
  }>
  /** Open repost composer for this post. The parent owns the dialog
   *  state — card just signals intent. */
  onRepost?: (post: PostCardData) => void
  /** Yorum butonuna tıklanınca çağrılır — verilirse buton `hrefDetail`'e
   *  gitmek yerine bunu çağırır (bottom-sheet reply composer için). */
  onComment?: (post: PostCardData) => void
  /** Soft-delete handler — only shown to author + owner/admin. */
  onDelete?: (post: PostCardData) => Promise<void>
  /** Hide the action row (used inside the detail header where actions
   *  live below the body explicitly). */
  hideActions?: boolean
  className?: string
  /** Compact mode for nested repost previews — smaller avatar, fewer
   *  attachment columns, no action row. */
  compact?: boolean
}

/**
 * URL-detection regex used by `linkify`. Matches absolute http(s) URLs
 * and bare domains; deliberately conservative to avoid false-positives
 * on hash IDs or filenames in casual chat. The render layer (not the
 * stored body) is what gets transformed — search/edit operations stay
 * on plain text.
 */
const LINK_RE = /(https?:\/\/[^\s<]+[^\s.,!?<])/gi

function linkify(text: string): ReactNode[] {
  if (!text) return []
  const parts = text.split(LINK_RE)
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline-offset-2 hover:underline"
        >
          {part}
        </a>
      )
    }
    return <span key={i}>{part}</span>
  })
}

function formatRelative(input: string | Date): string {
  try {
    const d = typeof input === "string" ? new Date(input) : input
    return formatDistanceToNow(d, { addSuffix: true })
  } catch {
    return ""
  }
}

export function PostCard({
  post,
  hrefDetail,
  authorHrefBase,
  viewerId,
  onToggleReaction,
  onRepost,
  onComment,
  onDelete,
  hideActions,
  className,
  compact,
}: PostCardProps) {
  const t = useTranslations("social")
  const [reactions, setReactions] = useState<{
    counts: Partial<Record<ReactionKey, number>>
    viewerReaction: ReactionKey | null
  }>({
    counts: post.reactionCounts,
    viewerReaction: post.viewerReaction,
  })

  const handleToggle = useCallback(
    async (key: ReactionKey) => {
      if (!onToggleReaction) return
      const prev = reactions
      // Optimistic: assume swap if there's an existing reaction, else
      // bump the new key by 1.
      const optimisticCounts = { ...prev.counts }
      if (prev.viewerReaction && prev.viewerReaction !== key) {
        optimisticCounts[prev.viewerReaction] = Math.max(
          (optimisticCounts[prev.viewerReaction] ?? 0) - 1,
          0,
        )
      }
      let nextViewer: ReactionKey | null = key
      if (prev.viewerReaction === key) {
        optimisticCounts[key] = Math.max((optimisticCounts[key] ?? 0) - 1, 0)
        nextViewer = null
      } else {
        optimisticCounts[key] = (optimisticCounts[key] ?? 0) + 1
      }
      setReactions({ counts: optimisticCounts, viewerReaction: nextViewer })
      try {
        const res = await onToggleReaction(post.id, key)
        setReactions({ counts: res.counts, viewerReaction: res.viewerReaction })
      } catch (err) {
        setReactions(prev)
        toast.error(err instanceof Error ? err.message : t("reactionFailed"))
      }
    },
    [onToggleReaction, post.id, reactions, t],
  )

  const handleCopyLink = useCallback(() => {
    if (!hrefDetail) return
    const url =
      typeof window !== "undefined"
        ? new URL(hrefDetail, window.location.origin).toString()
        : hrefDetail
    navigator.clipboard.writeText(url).then(
      () => toast.success(t("linkCopied")),
      () => toast.error(t("linkCopyFailed")),
    )
  }, [hrefDetail, t])

  const handleDelete = useCallback(async () => {
    if (!onDelete) return
    const ok = await confirm({
      title: t("deleteConfirmTitle"),
      description: t("deleteConfirmDesc"),
      confirmText: t("delete"),
      destructive: true,
    })
    if (!ok) return
    try {
      await onDelete(post)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("deleteFailed"))
    }
  }, [onDelete, post, t])

  const isAuthor = viewerId && post.author && post.author.id === viewerId
  const showDelete = !!onDelete && !!isAuthor

  // İlk linki tespit et — OG önizleme kartı (ek görsel yoksa, compact değilse).
  const firstUrl = useMemo(() => {
    const m = post.text.match(LINK_RE)
    return m?.[0] ?? null
  }, [post.text])

  if (post.deletedAt) {
    return (
      <article
        className={cn(
          "rounded-2xl border border-dashed bg-muted/30 px-5 py-4 text-sm text-muted-foreground",
          className,
        )}
      >
        {t("postRemoved")}
      </article>
    )
  }

  const authorHref =
    authorHrefBase && post.author?.profileSlug
      ? `${authorHrefBase}/${post.author.profileSlug}`
      : null

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={cn(
        "flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm sm:p-5",
        compact && "p-3 sm:p-3.5",
        className,
      )}
    >
      <PostHeader
        author={post.author}
        authorHref={authorHref}
        createdAt={post.createdAt}
        compact={compact}
        kebab={
          !compact && (showDelete || hrefDetail) ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground"
                    aria-label="more"
                  >
                    <HugeiconsIcon
                      icon={MoreHorizontalIcon}
                      strokeWidth={2}
                      className="size-4"
                    />
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                {hrefDetail && (
                  <DropdownMenuItem onClick={handleCopyLink}>
                    <HugeiconsIcon
                      icon={Link01Icon}
                      strokeWidth={2}
                      className="size-4"
                      data-icon="inline-start"
                    />
                    {t("copyLink")}
                  </DropdownMenuItem>
                )}
                {showDelete && (
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => void handleDelete()}
                  >
                    <HugeiconsIcon
                      icon={Delete02Icon}
                      strokeWidth={2}
                      className="size-4"
                      data-icon="inline-start"
                    />
                    {t("delete")}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null
        }
      />

      {(post.text || post.bodyHtml) && (
        <PostBody
          text={post.text}
          bodyHtml={post.bodyHtml ?? null}
          hrefDetail={hrefDetail}
          compact={compact}
        />
      )}

      {post.attachments.length > 0 && (
        <PostAttachments attachments={post.attachments} compact={compact} />
      )}

      {firstUrl && !compact && post.attachments.length === 0 && !post.repostOfPost && (
        <LinkPreview url={firstUrl} />
      )}

      {post.repostOfPost && (
        <NestedRepost
          source={post.repostOfPost}
          authorHrefBase={authorHrefBase}
        />
      )}

      {!hideActions && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-1">
            {onComment ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onComment(post)}
                className="gap-1.5 rounded-full text-xs text-muted-foreground hover:text-foreground"
              >
                <HugeiconsIcon
                  icon={Comment01Icon}
                  strokeWidth={2}
                  className="size-3.5"
                />
                <span className="tabular-nums">{post.commentCount}</span>
              </Button>
            ) : hrefDetail ? (
              <Link href={hrefDetail}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 rounded-full text-xs text-muted-foreground hover:text-foreground"
                >
                  <HugeiconsIcon
                    icon={Comment01Icon}
                    strokeWidth={2}
                    className="size-3.5"
                  />
                  <span className="tabular-nums">{post.commentCount}</span>
                </Button>
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2 text-xs text-muted-foreground">
                <HugeiconsIcon
                  icon={Comment01Icon}
                  strokeWidth={2}
                  className="size-3.5"
                />
                <span className="tabular-nums">{post.commentCount}</span>
              </span>
            )}
            {onRepost && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onRepost(post)}
                className="gap-1.5 rounded-full text-xs text-muted-foreground hover:text-foreground"
              >
                <HugeiconsIcon
                  icon={RepeatIcon}
                  strokeWidth={2}
                  className="size-3.5"
                />
                <span className="tabular-nums">{post.repostCount}</span>
              </Button>
            )}
          </div>
          {onToggleReaction && (
            <ReactionPicker
              active={reactions.viewerReaction}
              counts={reactions.counts}
              onToggle={handleToggle}
              variant="chip-row"
              size="sm"
            />
          )}
        </div>
      )}
    </motion.article>
  )
}

function PostHeader({
  author,
  authorHref,
  createdAt,
  compact,
  kebab,
}: {
  author: PostCardAuthor | null
  authorHref: string | null
  createdAt: string | Date
  compact?: boolean
  kebab?: ReactNode
}) {
  const initials = (author?.name ?? "?")
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
  const avatar = author?.image ? (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={author.image}
      alt={author.name}
      className={cn(
        "shrink-0 rounded-full border bg-muted object-cover",
        compact ? "size-8" : "size-10",
      )}
    />
  ) : (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary",
        compact ? "size-8 text-[10px]" : "size-10 text-xs",
      )}
    >
      {initials || "?"}
    </span>
  )
  return (
    <header className="flex items-start gap-3">
      {authorHref ? (
        <Link href={authorHref} className="shrink-0">
          {avatar}
        </Link>
      ) : (
        avatar
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {/* 1. satır: görünen ad + rol badge (Twitter-tarzı). */}
        <div className="flex items-center gap-1.5">
          {authorHref ? (
            <Link
              href={authorHref}
              className="truncate text-sm font-semibold leading-tight hover:underline"
            >
              {author?.name || "—"}
            </Link>
          ) : (
            <span className="truncate text-sm font-semibold leading-tight">
              {author?.name || "—"}
            </span>
          )}
          {author?.role === "owner" || author?.role === "admin" ? (
            <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium capitalize text-primary">
              {author.role}
            </span>
          ) : null}
        </div>
        {/* 2. satır: @handle · zaman. Handle yoksa yalnız zaman. */}
        <div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          {author?.profileSlug ? (
            <>
              {authorHref ? (
                <Link href={authorHref} className="truncate hover:underline">
                  @{author.profileSlug}
                </Link>
              ) : (
                <span className="truncate">@{author.profileSlug}</span>
              )}
              <span aria-hidden>·</span>
            </>
          ) : null}
          <time
            dateTime={
              typeof createdAt === "string" ? createdAt : createdAt.toISOString()
            }
            className="shrink-0 truncate"
          >
            {formatRelative(createdAt)}
          </time>
        </div>
      </div>
      {kebab}
    </header>
  )
}

function PostBody({
  text,
  bodyHtml,
  hrefDetail,
  compact,
}: {
  text: string
  bodyHtml?: string | null
  hrefDetail?: string
  compact?: boolean
}) {
  const safeHtml = useMemo(
    () => (bodyHtml ? sanitizeHtml(bodyHtml) : null),
    [bodyHtml],
  )
  const content = useMemo(() => linkify(text), [text])

  // Zengin gövde: kendi linkleri/mention'ları olduğundan Link sarmalanmaz
  // (nested <a> sorunları). Detay nav'ı yorum/kart aksiyonlarından sağlanır.
  if (safeHtml) {
    return (
      <div
        className={cn(
          "tiptap-post break-words leading-relaxed [&_a]:text-primary [&_a]:underline-offset-2 hover:[&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1",
          compact ? "text-sm" : "text-[15px]",
        )}
        // sanitize edilmiş (write-time + burada tekrar) — XSS yok
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />
    )
  }

  const body = (
    <p
      className={cn(
        "whitespace-pre-wrap break-words leading-relaxed",
        compact ? "text-sm" : "text-[15px]",
      )}
    >
      {content}
    </p>
  )
  if (hrefDetail) {
    // Wrap clickable area but keep links interactive — Next.js Link
    // handles delegated nav, links with target=_blank short-circuit.
    return (
      <Link href={hrefDetail} className="block">
        {body}
      </Link>
    )
  }
  return body
}

function PostAttachments({
  attachments,
  compact,
}: {
  attachments: Array<{ url: string; width?: number; height?: number }>
  compact?: boolean
}) {
  const cols =
    attachments.length === 1
      ? "grid-cols-1"
      : attachments.length === 3
        ? "grid-cols-2"
        : "grid-cols-2"
  return (
    <div className={cn("grid gap-1.5 overflow-hidden rounded-xl", cols)}>
      {attachments.map((a, i) => (
        <a
          key={a.url}
          href={a.url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "relative block overflow-hidden border bg-muted",
            attachments.length === 3 && i === 0 && "row-span-2",
            compact ? "aspect-video" : "aspect-[4/3]",
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={a.url}
            alt=""
            className="h-full w-full object-cover transition-transform hover:scale-[1.02]"
            loading="lazy"
          />
        </a>
      ))}
    </div>
  )
}

function NestedRepost({
  source,
  authorHrefBase,
}: {
  source: NonNullable<PostCardData["repostOfPost"]>
  authorHrefBase?: string
}) {
  if (source.deletedAt) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        {/* Translation key intentionally inline-friendly — render context
            already wraps in a NextIntlClientProvider. */}
        Original post removed
      </div>
    )
  }
  return (
    <div className="rounded-xl border bg-muted/20 p-3">
      <PostCard
        post={
          {
            ...source,
            repostOfPost: null,
            reactionCounts: source.reactionCounts ?? {},
            viewerReaction: null,
          } as PostCardData
        }
        compact
        hideActions
        authorHrefBase={authorHrefBase}
      />
    </div>
  )
}
