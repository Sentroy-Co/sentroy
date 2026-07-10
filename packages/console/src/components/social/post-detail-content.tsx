"use client"

import { useCallback, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons"
import { buttonVariants } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import {
  PostCard,
  type PostCardData,
} from "@workspace/console/components/social/post-card"
import { CommentThread } from "@workspace/console/components/social/comment-thread"
import { OsLinkBridge } from "@workspace/console/components/social/os-link-bridge"
import type { ReactionKey } from "@workspace/console/components/social/reaction-picker"

interface PostDetailContentProps {
  post: PostCardData
  lang: string
  companySlug: string
  viewer: {
    id: string
    name: string | null
    image: string | null
  } | null
  /** OS stack içinde render edilirken "back to feed" butonunu gizle — stack
   *  kendi geri butonunu sağlar. */
  hideBackToFeed?: boolean
  /** Widget/stack içinde dar alana sığdır — fazla padding + max-width kaldır. */
  compact?: boolean
}

/**
 * Detail page client wrapper: pinned post header + comment thread. The
 * post card is mounted in `hideActions` mode so we can render its own
 * action row + reaction picker explicitly here, with bigger glyphs and
 * stronger separation from the header. Repost flows redirect back to
 * the company feed where the composer dialog lives.
 */
export function PostDetailContent({
  post: initialPost,
  lang,
  companySlug,
  viewer,
  hideBackToFeed,
  compact,
}: PostDetailContentProps) {
  const t = useTranslations("social")
  const router = useRouter()
  const [post, setPost] = useState(initialPost)
  // Reply composer bottom-sheet — ana post'un yorum butonundan açılır.
  const [replyOpen, setReplyOpen] = useState(false)

  const backHref = `/${lang}/d/${companySlug}/posts`
  const feedHref = `/${lang}/d/${companySlug}/posts`

  const handleToggleReaction = useCallback(
    async (postId: string, key: ReactionKey) => {
      const res = await fetch(
        `/api/companies/${companySlug}/posts/${postId}/reactions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reactionKey: key }),
        },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t("reactionFailed"))
      const counts = (json.data?.counts ?? {}) as Partial<
        Record<ReactionKey, number>
      >
      const viewerReaction = (json.data?.viewerReaction ?? null) as
        | ReactionKey
        | null
      setPost((prev) => ({
        ...prev,
        reactionCounts: counts,
        viewerReaction,
        reactionCount: Object.values(counts).reduce(
          (sum, n) => sum + (n ?? 0),
          0,
        ),
      }))
      return { counts, viewerReaction }
    },
    [companySlug, t],
  )

  const handleDelete = useCallback(
    async (target: PostCardData) => {
      const res = await fetch(
        `/api/companies/${companySlug}/posts/${target.id}`,
        { method: "DELETE" },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t("deleteFailed"))
      toast.success(t("deleted"))
      router.push(feedHref)
    },
    [companySlug, feedHref, router, t],
  )

  const handleRepost = useCallback(
    (target: PostCardData) => {
      // Repost composer lives on the feed page; bounce there with the
      // target id so it can pre-open the dialog.
      router.push(`${feedHref}?repost=${target.id}`)
    },
    [feedHref, router],
  )

  const detailHref = useMemo(
    () => `/${lang}/d/${companySlug}/posts/${post.id}`,
    [companySlug, lang, post.id],
  )

  return (
    <OsLinkBridge>
    <div
      className={cn(
        "mx-auto flex w-full flex-col",
        compact ? "max-w-none gap-3" : "max-w-2xl gap-4 px-4 py-6 sm:px-6",
      )}
    >
      {!hideBackToFeed && (
        <div className="flex items-center justify-between">
          <Link
            href={backHref}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "text-muted-foreground",
            )}
          >
            <HugeiconsIcon
              icon={ArrowLeft01Icon}
              strokeWidth={2}
              className="size-3.5"
              data-icon="inline-start"
            />
            {t("backToFeed")}
          </Link>
        </div>
      )}

      <PostCard
        post={post}
        viewerId={viewer?.id ?? null}
        hrefDetail={detailHref}
        authorHrefBase={`/${lang}/profile/u`}
        onToggleReaction={handleToggleReaction}
        onRepost={handleRepost}
        onComment={() => setReplyOpen(true)}
        onDelete={handleDelete}
      />

      <CommentThread
        companySlug={companySlug}
        postId={post.id}
        lang={lang}
        viewer={viewer}
        composerOpen={replyOpen}
        onComposerOpenChange={setReplyOpen}
      />
    </div>
    </OsLinkBridge>
  )
}
