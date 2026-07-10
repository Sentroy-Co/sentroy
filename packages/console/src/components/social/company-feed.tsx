"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Sentroy } from "@sentroy-co/client-sdk"
import { motion } from "framer-motion"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  MessageAdd01Icon,
  Loading03Icon,
} from "@hugeicons/core-free-icons"
import { cn } from "@workspace/ui/lib/utils"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  PostCard,
  type PostCardData,
} from "@workspace/console/components/social/post-card"
import { PostComposer } from "@workspace/console/components/social/post-composer"
import type { ReactionKey } from "@workspace/console/components/social/reaction-picker"

interface CompanyFeedProps {
  /** Optional viewer info — composer renders an avatar chip and the
   *  card layer flags author-only actions when this matches. */
  viewer?: {
    id: string
    name: string | null
    image: string | null
  } | null
  /** Locale prefix for routing — used to build /[lang]/d/<slug> and
   *  /[lang]/profile/u/<slug> hrefs. */
  lang: string
  /** Optional initial posts payload (server-rendered). When provided,
   *  the feed skips the first network call. */
  initialPosts?: PostCardData[]
  /** Company slug override — defaults to the URL `[company-slug]` param.
   *  Used when the feed renders outside its route (e.g. Sentroy OS widget). */
  slug?: string
}

/**
 * Company timeline — composer + paginated post list. All endpoints are
 * scoped to the company slug (URL `[company-slug]` param by default, or the
 * `slug` prop) so the same component plugs into the dashboard route, the
 * company profile page and the Sentroy OS widget.
 */
export function CompanyFeed({ viewer, lang, initialPosts, slug: slugProp }: CompanyFeedProps) {
  const t = useTranslations("social")
  const params = useParams<{ "company-slug": string }>()
  const slug = slugProp ?? params["company-slug"]

  const [posts, setPosts] = useState<PostCardData[]>(initialPosts ?? [])
  const [loading, setLoading] = useState(initialPosts ? false : true)
  const [nextBefore, setNextBefore] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [repostTarget, setRepostTarget] = useState<PostCardData | null>(null)
  // Profil tabları (Twitter): Postlar (orijinal) / Yanıtlar / Repostlar.
  const [tab, setTab] = useState<"posts" | "replies" | "reposts">("posts")

  const sentroyClient = useMemo(() => {
    if (!slug) return null
    const baseUrl =
      process.env.NEXT_PUBLIC_CORE_APP_URL ||
      (typeof window !== "undefined" ? window.location.origin : "")
    return new Sentroy({
      baseUrl,
      companySlug: slug,
    } as unknown as ConstructorParameters<typeof Sentroy>[0])
  }, [slug])

  const fetchPosts = useCallback(
    async (opts?: { before?: string }) => {
      const url = new URL(
        `/api/companies/${slug}/posts`,
        typeof window !== "undefined" ? window.location.origin : "http://localhost",
      )
      if (opts?.before) url.searchParams.set("before", opts.before)
      url.searchParams.set("tab", tab)
      const res = await fetch(url.pathname + url.search)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to load")
      return json.data as { posts: PostCardData[]; nextBefore: string | null }
    },
    [slug, tab],
  )

  // Mount + tab değişiminde getir. (initialPosts yalnız ilk paint'i hızlandırır;
  // tab filtresi için her zaman taze çekeriz.)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchPosts()
      .then((data) => {
        if (cancelled) return
        setPosts(data.posts)
        setNextBefore(data.nextBefore)
      })
      .catch((err) => {
        if (cancelled) return
        toast.error(err instanceof Error ? err.message : t("loadFailed"))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [fetchPosts, t])

  const handleSubmit = useCallback(
    async (input: {
      text: string
      bodyHtml?: string
      mentions?: string[]
      visibility?: string
      attachments: Array<{
        mediaId: string
        url: string
        width?: number
        height?: number
      }>
      repostOf?: string
    }) => {
      const res = await fetch(`/api/companies/${slug}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: input.text,
          bodyHtml: input.bodyHtml,
          mentions: input.mentions,
          visibility: input.visibility,
          attachments: input.attachments,
          repostOf: input.repostOf,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t("publishFailed"))
      const post = json.data?.post as PostCardData
      setPosts((prev) => [post, ...prev])
      setRepostTarget(null)
      toast.success(t("published"))
    },
    [slug, t],
  )

  const handleToggleReaction = useCallback(
    async (postId: string, key: ReactionKey) => {
      const res = await fetch(
        `/api/companies/${slug}/posts/${postId}/reactions`,
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
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                reactionCounts: counts,
                viewerReaction,
                reactionCount: Object.values(counts).reduce(
                  (sum, n) => sum + (n ?? 0),
                  0,
                ),
              }
            : p,
        ),
      )
      return { counts, viewerReaction }
    },
    [slug, t],
  )

  const handleDelete = useCallback(
    async (post: PostCardData) => {
      const res = await fetch(
        `/api/companies/${slug}/posts/${post.id}`,
        { method: "DELETE" },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t("deleteFailed"))
      setPosts((prev) => prev.filter((p) => p.id !== post.id))
      toast.success(t("deleted"))
    },
    [slug, t],
  )

  const loadMore = useCallback(async () => {
    if (!nextBefore || loadingMore) return
    setLoadingMore(true)
    try {
      const data = await fetchPosts({ before: nextBefore })
      setPosts((prev) => [...prev, ...data.posts])
      setNextBefore(data.nextBefore)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("loadFailed"))
    } finally {
      setLoadingMore(false)
    }
  }, [fetchPosts, loadingMore, nextBefore, t])

  return (
    <div className="flex flex-col gap-4">
      <PostComposer
        sentroyClient={sentroyClient}
        mentionSearchUrl={`/api/companies/${slug}/mention-search`}
        viewerAvatarUrl={viewer?.image ?? null}
        viewerName={viewer?.name ?? null}
        onSubmit={handleSubmit}
      />

      {/* Profil tabları — Postlar / Yanıtlar / Repostlar */}
      <div className="flex items-center gap-1 border-b">
        {(["posts", "replies", "reposts"] as const).map((tk) => (
          <button
            key={tk}
            type="button"
            onClick={() => setTab(tk)}
            className={cn(
              "relative -mb-px px-3 py-2 text-sm font-medium transition-colors",
              tab === tk
                ? "border-b-2 border-primary text-foreground"
                : "border-b-2 border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t(
              tk === "posts"
                ? "tabPosts"
                : tk === "replies"
                  ? "tabReplies"
                  : "tabReposts",
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <FeedSkeleton />
      ) : posts.length === 0 ? (
        <FeedEmpty />
      ) : (
        <div className="flex flex-col gap-3">
          {posts.map((post, i) => (
            <motion.div
              key={post.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: Math.min(i * 0.04, 0.4),
                duration: 0.3,
              }}
            >
              <PostCard
                post={post}
                viewerId={viewer?.id ?? null}
                hrefDetail={`/${lang}/d/${slug}/posts/${post.id}`}
                authorHrefBase={`/${lang}/profile/u`}
                onToggleReaction={handleToggleReaction}
                onRepost={(p) => setRepostTarget(p)}
                onDelete={handleDelete}
              />
            </motion.div>
          ))}

          {nextBefore && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore && (
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    strokeWidth={2}
                    className="size-3.5 animate-spin"
                    data-icon="inline-start"
                  />
                )}
                {t("loadMore")}
              </Button>
            </div>
          )}
        </div>
      )}

      <Dialog
        open={!!repostTarget}
        onOpenChange={(o) => !o && setRepostTarget(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("repostDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("repostDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          {repostTarget && (
            <div className="flex flex-col gap-3">
              <PostComposer
                sentroyClient={sentroyClient}
                mentionSearchUrl={`/api/companies/${slug}/mention-search`}
                repostOf={{ id: repostTarget.id }}
                viewerAvatarUrl={viewer?.image ?? null}
                viewerName={viewer?.name ?? null}
                onSubmit={handleSubmit}
                placeholder={t("repostPlaceholder")}
                autoFocus
              />
              <div className="rounded-xl border bg-muted/30 p-3">
                <PostCard post={repostTarget} compact hideActions />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FeedSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-32 animate-pulse rounded-2xl border bg-muted/30"
        />
      ))}
    </div>
  )
}

function FeedEmpty() {
  const t = useTranslations("social")
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed",
        "bg-muted/20 px-6 py-12 text-center",
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <HugeiconsIcon
          icon={MessageAdd01Icon}
          strokeWidth={1.5}
          className="size-6"
        />
      </span>
      <h3 className="text-base font-semibold">{t("emptyTitle")}</h3>
      <p className="max-w-md text-sm text-muted-foreground">
        {t("emptyDescription")}
      </p>
    </div>
  )
}
