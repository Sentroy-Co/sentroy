export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import {
  socialPostModel,
  socialCommentModel,
} from "@workspace/db/models"
import { hydrateComments } from "@/lib/social/hydrate"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; postId: string }> },
) {
  const { slug, postId } = await params
  const access = await assertCompanyAccess(request, slug)
  if ("error" in access) return access.error

  const post = await socialPostModel.findById(postId)
  if (!post || post.companyId !== access.companyId) {
    return jsonError("Post not found", 404)
  }

  const comments = await socialCommentModel.findByPost(postId, { limit: 200 })
  const viewerId = access.session?.user.id ?? null
  const hydrated = await hydrateComments(comments, viewerId)
  return jsonSuccess({ comments: hydrated })
}

/**
 * POST — add a comment to a post. Comments are short (max 500 chars)
 * plain text; rich content lives in posts. Authoring increments the
 * post's `commentCount` so feed cards can render the thread badge
 * without an extra COUNT query.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; postId: string }> },
) {
  const { slug, postId } = await params
  const access = await assertCompanyAccess(request, slug)
  if ("error" in access) return access.error
  if (!access.session) return jsonError("Unauthorized", 401)

  const post = await socialPostModel.findById(postId)
  if (!post || post.companyId !== access.companyId) {
    return jsonError("Post not found", 404)
  }
  if (post.deletedAt) return jsonError("Cannot comment on a deleted post", 410)

  let body: { text?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }
  const text = typeof body.text === "string" ? body.text.trim() : ""
  if (text.length === 0) return jsonError("Comment text required")
  if (text.length > 500) return jsonError("Comment too long (max 500)")

  const comment = await socialCommentModel.create({
    postId,
    companyId: access.companyId,
    authorUserId: access.session.user.id,
    text,
  })
  await socialPostModel.incrementCounter(postId, "commentCount", 1)

  const [hydrated] = await hydrateComments([comment], access.session.user.id)
  return jsonSuccess({ comment: hydrated })
}
