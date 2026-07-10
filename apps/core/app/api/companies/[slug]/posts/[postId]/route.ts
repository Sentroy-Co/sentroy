import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import {
  socialPostModel,
  socialReactionModel,
} from "@workspace/db/models"
import { hydratePosts } from "@/lib/social/hydrate"

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
  if (post.deletedAt) return jsonError("Post removed", 410)

  const viewerId = access.session?.user.id ?? null
  const [hydrated] = await hydratePosts([post], viewerId)
  return jsonSuccess({ post: hydrated })
}

/**
 * DELETE — soft-delete a post. Author or owner/admin can remove. The
 * post stays in the collection so comments and reactions can still
 * resolve (the UI shows a "post removed" placeholder), but it stops
 * appearing in the timeline. Reactions on the post are wiped to keep
 * counts accurate; comments stay so the conversation thread is
 * preserved.
 */
export async function DELETE(
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

  const isAuthor = post.authorUserId === access.session.user.id
  const isOwnerOrAdmin =
    access.member?.role === "owner" || access.member?.role === "admin"
  if (!isAuthor && !isOwnerOrAdmin) {
    return jsonError("Cannot delete this post", 403)
  }

  const ok = await socialPostModel.softDelete(postId)
  if (!ok) return jsonError("Already deleted", 409)

  await socialReactionModel.clearForTarget("post", postId)

  if (post.repostOf) {
    await socialPostModel.incrementCounter(post.repostOf, "repostCount", -1)
  }

  return jsonSuccess({ deleted: true })
}
