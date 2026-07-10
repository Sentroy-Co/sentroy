import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import {
  socialCommentModel,
  socialReactionModel,
} from "@workspace/db/models"
import type { ReactionKey } from "@workspace/db/types"

const VALID_KEYS: ReactionKey[] = [
  "like",
  "fire",
  "lmao",
  "clap",
  "cool",
  "mind_blown",
  "thinking",
  "raised_eyebrow",
  "sad",
  "angry",
]

export async function POST(
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
  if (comment.deletedAt) return jsonError("Comment removed", 410)

  let body: { reactionKey?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }
  const key = body.reactionKey as ReactionKey | undefined
  if (!key || !VALID_KEYS.includes(key)) {
    return jsonError("Invalid reactionKey")
  }

  const result = await socialReactionModel.toggle({
    targetType: "comment",
    targetId: commentId,
    companyId: access.companyId,
    userId: access.session.user.id,
    reactionKey: key,
  })

  let delta: 1 | -1 | 0 = 0
  if (result.active && !result.previousKey) delta = 1
  else if (!result.active) delta = -1
  if (delta !== 0) {
    await socialCommentModel.incrementReactionCount(commentId, delta)
  }

  const counts = await socialReactionModel.countByTargets("comment", [commentId])
  return jsonSuccess({
    targetId: commentId,
    viewerReaction: result.active ? key : null,
    counts: counts[commentId] ?? {},
  })
}
