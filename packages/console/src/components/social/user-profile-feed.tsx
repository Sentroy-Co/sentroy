"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { motion } from "framer-motion"
import { toast } from "sonner"
import {
  PostCard,
  type PostCardData,
} from "@workspace/console/components/social/post-card"
import type { ReactionKey } from "@workspace/console/components/social/reaction-picker"
import { OsLinkBridge } from "@workspace/console/components/social/os-link-bridge"

interface UserProfileFeedProps {
  /** Target user's profile slug. */
  profileSlug: string
  /** Locale prefix for routing. */
  lang: string
  /** Viewer info — null when the page is rendered for an anonymous user
   *  (the API short-circuits and we render the "no shared activity"
   *  empty state). */
  viewer?: {
    id: string
    name: string | null
    image: string | null
  } | null
}

/**
 * Public user profile feed. Hits `/api/profile/u/[slug]/posts` which
 * returns an intersection of the viewer's and target's company
 * memberships. Anonymous viewers always see an empty list — the API
 * never errors so we don't render a 401 banner here.
 *
 * Per-post reactions toggle through the *target post's* company-scoped
 * reactions endpoint; we look up the company slug from the post's
 * hydrated payload.
 */
export function UserProfileFeed({
  profileSlug,
  lang,
  viewer,
}: UserProfileFeedProps) {
  const t = useTranslations("social")
  const [posts, setPosts] = useState<PostCardData[]>([])
  const [loading, setLoading] = useState(true)
  const [errored, setErrored] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/profile/u/${profileSlug}/posts`)
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || "load failed")
        if (cancelled) return
        setPosts((json.data?.posts ?? []) as PostCardData[])
      })
      .catch(() => {
        if (cancelled) return
        setErrored(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [profileSlug])

  const handleToggleReaction = useCallback(
    async (postId: string, key: ReactionKey) => {
      const target = posts.find((p) => p.id === postId)
      const slug = target?.companySlug
      if (!slug) {
        throw new Error("Missing company context for reaction")
      }

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
                  (s, n) => s + (n ?? 0),
                  0,
                ),
              }
            : p,
        ),
      )
      return { counts, viewerReaction }
    },
    [posts, t],
  )

  if (loading) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("activityTitle")}
        </h2>
        {[0, 1].map((i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-2xl border bg-muted/30"
          />
        ))}
      </section>
    )
  }

  if (errored) {
    return null
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t("activityTitle")}
      </h2>
      {posts.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-muted/20 px-5 py-8 text-center text-sm text-muted-foreground">
          {viewer ? t("activityNoSharedPosts") : t("activitySignInPrompt")}
        </div>
      ) : (
        <OsLinkBridge>
        <div className="flex flex-col gap-3">
          {posts.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.04, 0.4) }}
            >
              <PostCard
                post={p}
                viewerId={viewer?.id ?? null}
                hrefDetail={
                  p.companySlug
                    ? `/${lang}/d/${p.companySlug}/posts/${p.id}`
                    : undefined
                }
                authorHrefBase={`/${lang}/profile/u`}
                onToggleReaction={
                  viewer ? handleToggleReaction : undefined
                }
              />
            </motion.div>
          ))}
        </div>
        </OsLinkBridge>
      )}
    </section>
  )
}
