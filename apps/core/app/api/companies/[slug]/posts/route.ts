export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import { socialPostModel } from "@workspace/db/models"
import type { SocialPostAttachment, SocialPostVisibility } from "@workspace/db/types"
import { sanitizeHtml } from "@workspace/console/lib/sanitize-html"
import { hydratePosts } from "@/lib/social/hydrate"

const VISIBILITIES: SocialPostVisibility[] = ["public", "members", "admins", "author"]

/**
 * GET — company timeline. Returns up to 30 posts ordered newest-first
 * with cursor pagination via `?before=<iso-timestamp>`. Each post is
 * hydrated with: author user (name+image+profileSlug), the source post
 * for reposts, attachments as-stored, per-target reaction counts, and
 * the viewer's reaction (so the picker can preselect their tap state).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug)
  if ("error" in access) return access.error

  const url = new URL(request.url)
  const beforeRaw = url.searchParams.get("before")
  const limitRaw = url.searchParams.get("limit")
  const limit = Math.min(Math.max(Number(limitRaw) || 30, 1), 50)
  const before = beforeRaw ? new Date(beforeRaw) : undefined

  const viewerId = access.session?.user.id ?? null
  const isAdmin =
    (access.session?.user as { role?: string } | undefined)?.role === "admin" ||
    access.member?.role === "owner" ||
    access.member?.role === "admin"
  const tabRaw = url.searchParams.get("tab")
  const tab =
    tabRaw === "replies" || tabRaw === "reposts" || tabRaw === "posts"
      ? tabRaw
      : undefined
  const posts = await socialPostModel.findCompanyTimeline(
    access.companyId,
    { userId: viewerId ?? "", isAdmin },
    { limit, before, tab },
  )
  const hydrated = await hydratePosts(posts, viewerId)

  return jsonSuccess({
    posts: hydrated,
    nextBefore:
      hydrated.length === limit
        ? hydrated[hydrated.length - 1]!.createdAt
        : null,
  })
}

interface CreateBody {
  text?: string
  attachments?: Array<{
    mediaId?: string
    url?: string
    width?: number
    height?: number
    type?: string
  }>
  repostOf?: string
  /** Yanıt = parentId'li post (comments-as-posts). */
  parentId?: string
  /** Gizlilik seviyesi (default members). */
  visibility?: string
  /** TipTap zengin HTML — server-side sanitize edilir. */
  bodyHtml?: string
  /** Mention edilen kullanıcı id'leri. */
  mentions?: string[]
}

/**
 * POST — create a post. Plain text is capped at 1000 chars; attachments
 * are limited to 4 image entries (Twitter parity); a repost wraps an
 * existing post inside the same company. Empty bodies are rejected
 * unless an attachment or repostOf is present so we never store fully
 * empty rows.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug)
  if ("error" in access) return access.error
  if (!access.session) return jsonError("Unauthorized", 401)

  let body: CreateBody
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const text = typeof body.text === "string" ? body.text.trim() : ""
  if (text.length > 1000) return jsonError("Text too long (max 1000)")

  const rawAttachments = Array.isArray(body.attachments) ? body.attachments : []
  if (rawAttachments.length > 4) return jsonError("Too many attachments (max 4)")

  const attachments: SocialPostAttachment[] = []
  for (const a of rawAttachments) {
    if (!a || typeof a.url !== "string" || !/^https?:\/\//.test(a.url)) {
      return jsonError("Each attachment needs an http(s) url")
    }
    attachments.push({
      mediaId: typeof a.mediaId === "string" ? a.mediaId : "",
      url: a.url,
      width: typeof a.width === "number" ? a.width : undefined,
      height: typeof a.height === "number" ? a.height : undefined,
      type: "image",
    })
  }

  let repostOf: string | null = null
  if (typeof body.repostOf === "string" && body.repostOf.length > 0) {
    const source = await socialPostModel.findById(body.repostOf)
    if (!source) return jsonError("Source post not found", 404)
    if (source.companyId !== access.companyId) {
      return jsonError("Cannot repost across companies", 403)
    }
    if (source.deletedAt) return jsonError("Cannot repost a deleted post", 410)
    repostOf = source.id
  }

  // Yanıt (comments-as-posts): parentId verilince thread'e bağlanır.
  let parentId: string | null = null
  let rootId: string | null = null
  if (typeof body.parentId === "string" && body.parentId.length > 0) {
    const parent = await socialPostModel.findById(body.parentId)
    if (!parent || parent.companyId !== access.companyId) {
      return jsonError("Parent post not found", 404)
    }
    if (parent.deletedAt) return jsonError("Cannot reply to a deleted post", 410)
    parentId = parent.id
    rootId = parent.rootId ?? parent.id
  }

  const visibility: SocialPostVisibility = VISIBILITIES.includes(
    body.visibility as SocialPostVisibility,
  )
    ? (body.visibility as SocialPostVisibility)
    : "members"

  if (text.length === 0 && attachments.length === 0 && !repostOf) {
    return jsonError("Post needs text, an attachment, or a repost target")
  }

  // Zengin gövde — KULLANICI HTML'i her zaman server-side sanitize (XSS).
  const bodyHtml =
    typeof body.bodyHtml === "string" && body.bodyHtml.trim()
      ? sanitizeHtml(body.bodyHtml)
      : null
  const mentions = Array.isArray(body.mentions)
    ? Array.from(
        new Set(
          body.mentions.filter((m): m is string => typeof m === "string"),
        ),
      ).slice(0, 50)
    : []

  const post = await socialPostModel.create({
    companyId: access.companyId,
    authorUserId: access.session.user.id,
    text,
    bodyHtml,
    mentions,
    attachments,
    repostOf,
    parentId,
    rootId,
    visibility,
  })

  if (parentId) {
    // Yanıt → ebeveynin yanıt sayacını artır.
    await socialPostModel.incrementCounter(parentId, "commentCount", 1)
  }
  if (repostOf) {
    await socialPostModel.incrementCounter(repostOf, "repostCount", 1)
  }

  const [hydrated] = await hydratePosts([post], access.session.user.id)
  return jsonSuccess({ post: hydrated })
}
