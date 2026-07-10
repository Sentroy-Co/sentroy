"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon } from "@hugeicons/core-free-icons"
import { Sentroy } from "@sentroy-co/client-sdk"
import { cn } from "@workspace/ui/lib/utils"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@workspace/ui/components/drawer"
import {
  PostCard,
  type PostCardData,
} from "@workspace/console/components/social/post-card"
import { PostComposer } from "@workspace/console/components/social/post-composer"
import type { ReactionKey } from "@workspace/console/components/social/reaction-picker"

interface CommentThreadProps {
  companySlug: string
  postId: string
  /** Locale prefix for author profile + reply detail links. */
  lang: string
  viewer: { id: string; name: string | null; image: string | null } | null
  /** Reply composer artık her zaman görünmez — post'un yorum butonundan
   *  açılan bir bottom-sheet (Drawer) içinde. Parent açık state'i tutar. */
  composerOpen?: boolean
  onComposerOpenChange?: (open: boolean) => void
  className?: string
}

/**
 * Yanıt thread'i (comments-as-posts). Bir post'un doğrudan yanıtları artık
 * birer POST (parentId=postId) → her biri tam bir `PostCard` (reaksiyon,
 * sil, kendi detayına git = iç içe yanıtlar). Yanıt oluşturma zengin
 * `PostComposer` (TipTap + @mention) ile `parentId`'li POST. Daha derin
 * thread'e bir yanıtın detayına giderek inilir (Twitter modeli).
 */
export function CommentThread({
  companySlug,
  postId,
  lang,
  viewer,
  composerOpen,
  onComposerOpenChange,
  className,
}: CommentThreadProps) {
  const t = useTranslations("social")
  const [replies, setReplies] = useState<PostCardData[]>([])
  const [loading, setLoading] = useState(true)
  // Controlled değilse kendi içinde yönet (fallback).
  const [selfOpen, setSelfOpen] = useState(false)
  const isControlled = composerOpen !== undefined
  const open = isControlled ? composerOpen : selfOpen
  const setOpen = useCallback(
    (v: boolean) => {
      if (isControlled) onComposerOpenChange?.(v)
      else setSelfOpen(v)
    },
    [isControlled, onComposerOpenChange],
  )

  const sentroyClient = useMemo(() => {
    const baseUrl =
      process.env.NEXT_PUBLIC_CORE_APP_URL ||
      (typeof window !== "undefined" ? window.location.origin : "")
    return new Sentroy({
      baseUrl,
      companySlug,
    } as unknown as ConstructorParameters<typeof Sentroy>[0])
  }, [companySlug])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/companies/${companySlug}/posts/${postId}/replies`)
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || "Failed")
        if (cancelled) return
        setReplies((json.data?.replies ?? []) as PostCardData[])
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
  }, [companySlug, postId, t])

  const handleReply = useCallback(
    async (input: {
      text: string
      bodyHtml: string
      mentions: string[]
      visibility: string
      attachments: Array<{ mediaId: string; url: string; width?: number; height?: number }>
    }) => {
      const res = await fetch(`/api/companies/${companySlug}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: input.text,
          bodyHtml: input.bodyHtml,
          mentions: input.mentions,
          visibility: input.visibility,
          attachments: input.attachments,
          parentId: postId,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t("commentFailed"))
      setReplies((prev) => [...prev, json.data?.post as PostCardData])
      setOpen(false)
    },
    [companySlug, postId, t, setOpen],
  )

  const removeReply = useCallback((id: string) => {
    setReplies((prev) => prev.filter((r) => r.id !== id))
  }, [])

  return (
    <section className={cn("flex flex-col gap-3", className)}>
      {/* Reply composer bottom-sheet — post'un yorum butonundan açılır. */}
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader className="pb-2">
            <DrawerTitle>{t("replyTitle")}</DrawerTitle>
          </DrawerHeader>
          <div className="max-h-[65vh] overflow-y-auto px-4 pb-6">
            <PostComposer
              sentroyClient={sentroyClient}
              mentionSearchUrl={`/api/companies/${companySlug}/mention-search`}
              viewerAvatarUrl={viewer?.image ?? null}
              viewerName={viewer?.name ?? null}
              placeholder={t("commentPlaceholder")}
              autoFocus={open}
              onSubmit={handleReply}
            />
          </div>
        </DrawerContent>
      </Drawer>

      <h3 className="px-1 text-sm font-semibold text-muted-foreground">
        {t("commentsTitle", { count: replies.length })}
      </h3>

      {loading ? (
        <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-3.5 animate-spin" />
          {t("loading")}
        </div>
      ) : replies.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          {t("commentsEmpty")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {replies.map((r) => (
              <motion.div
                key={r.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <ReplyNode
                  reply={r}
                  depth={0}
                  companySlug={companySlug}
                  lang={lang}
                  viewer={viewer}
                  onDeleted={removeReply}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  )
}

const MAX_DEPTH = 2

/**
 * Recursive yanıt düğümü — yanıt PostCard + (varsa) kendi yanıtları girintili
 * biçimde altında (hiyerarşik). MAX_DEPTH'e kadar otomatik açılır; daha derin
 * yanıtlara PostCard'ın yorum butonundan (detay/stack) inilir. Reaksiyon/sil
 * her düğümde kendi kendine (companySlug + reply id).
 */
function ReplyNode({
  reply,
  depth,
  companySlug,
  lang,
  viewer,
  onDeleted,
}: {
  reply: PostCardData
  depth: number
  companySlug: string
  lang: string
  viewer: { id: string; name: string | null; image: string | null } | null
  onDeleted: (id: string) => void
}) {
  const t = useTranslations("social")
  const canNest = depth < MAX_DEPTH && reply.commentCount > 0
  const [children, setChildren] = useState<PostCardData[] | null>(null)

  useEffect(() => {
    if (!canNest || children !== null) return
    let cancelled = false
    fetch(`/api/companies/${companySlug}/posts/${reply.id}/replies`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled) setChildren((j?.data?.replies ?? []) as PostCardData[])
      })
      .catch(() => {
        if (!cancelled) setChildren([])
      })
    return () => {
      cancelled = true
    }
  }, [canNest, children, companySlug, reply.id])

  const toggleReaction = useCallback(
    async (id: string, key: ReactionKey) => {
      const res = await fetch(`/api/companies/${companySlug}/posts/${id}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reactionKey: key }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t("reactionFailed"))
      return {
        counts: (json.data?.counts ?? {}) as Partial<Record<ReactionKey, number>>,
        viewerReaction: (json.data?.viewerReaction ?? null) as ReactionKey | null,
      }
    },
    [companySlug, t],
  )

  const del = useCallback(
    async (p: PostCardData) => {
      const res = await fetch(`/api/companies/${companySlug}/posts/${p.id}`, {
        method: "DELETE",
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t("deleteFailed"))
      onDeleted(p.id)
      toast.success(t("deleted"))
    },
    [companySlug, onDeleted, t],
  )

  const removeChild = useCallback((id: string) => {
    setChildren((cs) => (cs ? cs.filter((c) => c.id !== id) : cs))
  }, [])

  return (
    <div>
      <PostCard
        post={reply}
        viewerId={viewer?.id ?? null}
        hrefDetail={`/${lang}/d/${companySlug}/posts/${reply.id}`}
        authorHrefBase={`/${lang}/profile/u`}
        onToggleReaction={toggleReaction}
        onDelete={del}
      />
      {canNest ? (
        <div className="ml-4 mt-2 flex flex-col gap-2 border-l pl-3">
          {children === null ? (
            <span className="size-4 animate-spin rounded-full border-2 border-muted border-t-foreground/40" />
          ) : (
            children.map((c) => (
              <ReplyNode
                key={c.id}
                reply={c}
                depth={depth + 1}
                companySlug={companySlug}
                lang={lang}
                viewer={viewer}
                onDeleted={removeChild}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}
