export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import {
  socialPostModel,
  socialCommentModel,
  socialReactionModel,
} from "@workspace/db/models"

export async function DELETE(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ slug: string; postId: string; commentId: string }>
  },
) {
  const { slug, postId, commentId } = await params
  const access = await assertCompanyAccess(request, slug)
  if ("error" in access) return access.error
  if (!access.session) return jsonError("Unauthorized", 401)

  const comment = await socialCommentModel.findById(commentId)
  if (
    !comment ||
    comment.postId !== postId ||
    comment.companyId !== access.companyId
  ) {
    return jsonError("Comment not found", 404)
  }

  const isAuthor = comment.authorUserId === access.session.user.id
  const isOwnerOrAdmin =
    access.member?.role === "owner" || access.member?.role === "admin"
  if (!isAuthor && !isOwnerOrAdmin) {
    return jsonError("Cannot delete this comment", 403)
  }

  const ok = await socialCommentModel.softDelete(commentId)
  if (!ok) return jsonError("Already deleted", 409)
  await socialReactionModel.clearForTarget("comment", commentId)
  await socialPostModel.incrementCounter(postId, "commentCount", -1)
  return jsonSuccess({ deleted: true })
}
