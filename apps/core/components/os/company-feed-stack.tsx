"use client"

import { useCallback, useEffect, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons"
import { CompanyFeed } from "@workspace/console/components/social/company-feed"
import { PostDetailContent } from "@workspace/console/components/social/post-detail-content"
import { UserProfileFeed } from "@workspace/console/components/social/user-profile-feed"
import { OsLinkBridge } from "@workspace/console/components/social/os-link-bridge"
import type { PostCardData } from "@workspace/console/components/social/post-card"

type Viewer = { id: string; name: string | null; image: string | null }

type Frame =
  | { kind: "feed" }
  | { kind: "post"; companySlug: string; postId: string; title: string }
  | { kind: "user"; profileSlug: string; title: string }

const USER_RE = /^\/[a-z]{2}\/profile\/u\/([^/?#]+)/
const POST_RE = /^\/[a-z]{2}\/d\/([^/]+)\/posts\/([^/?#]+)/

/**
 * Sentroy OS Activity widget'ı için şirket feed'i + NAVIGASYON STACK'i.
 * Avatar/post tıklaması ayrı OS penceresi AÇMAZ — bu widget alanında stack'e
 * push edilir (push/pop, kendi geri butonu). Tüm içerik tek `OsLinkBridge`
 * ile sarılır; native mod (onOpen) → postMessage yok, dahili post/profil
 * linkleri push'a çevrilir. Frame'ler native render (iframe yok) → iç içe
 * tıklamalar aynı stack'e biner.
 */
export function CompanyFeedStack({
  lang,
  slug,
  viewer,
}: {
  lang: string
  slug: string
  viewer: Viewer
}) {
  const [frames, setFrames] = useState<Frame[]>([{ kind: "feed" }])
  const top = frames[frames.length - 1]!

  const push = useCallback((href: string, title: string) => {
    const u = USER_RE.exec(href)
    if (u) {
      setFrames((f) => [...f, { kind: "user", profileSlug: decodeURIComponent(u[1]!), title }])
      return
    }
    const p = POST_RE.exec(href)
    if (p) {
      setFrames((f) => [
        ...f,
        { kind: "post", companySlug: decodeURIComponent(p[1]!), postId: decodeURIComponent(p[2]!), title },
      ])
    }
  }, [])

  const pop = useCallback(() => {
    setFrames((f) => (f.length > 1 ? f.slice(0, -1) : f))
  }, [])

  return (
    <OsLinkBridge onOpen={push}>
      {frames.length > 1 ? (
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={pop}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" strokeWidth={2} />
            {top.kind === "post" || top.kind === "user" ? top.title : "Back"}
          </button>
        </div>
      ) : null}

      {top.kind === "feed" ? (
        <CompanyFeed lang={lang} slug={slug} viewer={viewer} />
      ) : top.kind === "user" ? (
        <UserProfileFeed profileSlug={top.profileSlug} lang={lang} viewer={viewer} />
      ) : (
        <StackPost companySlug={top.companySlug} postId={top.postId} lang={lang} viewer={viewer} />
      )}
    </OsLinkBridge>
  )
}

/** Post-detay frame'i — postu id'den çeker, PostDetailContent native render. */
function StackPost({
  companySlug,
  postId,
  lang,
  viewer,
}: {
  companySlug: string
  postId: string
  lang: string
  viewer: Viewer
}) {
  const [post, setPost] = useState<PostCardData | null>(null)
  const [errored, setErrored] = useState(false)

  useEffect(() => {
    let cancelled = false
    setPost(null)
    setErrored(false)
    fetch(`/api/companies/${companySlug}/posts/${postId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("not found"))))
      .then((j) => {
        if (!cancelled) setPost(j.data?.post as PostCardData)
      })
      .catch(() => {
        if (!cancelled) setErrored(true)
      })
    return () => {
      cancelled = true
    }
  }, [companySlug, postId])

  if (errored) {
    return <p className="px-2 py-8 text-center text-sm text-muted-foreground">—</p>
  }
  if (!post) {
    return (
      <div className="flex items-center justify-center py-10">
        <span className="size-6 animate-spin rounded-full border-2 border-muted border-t-foreground/40" />
      </div>
    )
  }
  return (
    <PostDetailContent
      post={post}
      lang={lang}
      companySlug={companySlug}
      viewer={viewer}
      hideBackToFeed
      compact
    />
  )
}
