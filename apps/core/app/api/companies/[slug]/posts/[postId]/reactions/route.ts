import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import {
  socialPostModel,
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

/**
 * POST — toggle a reaction on a post. Idempotent: same key twice
 * removes the reaction; a different key swaps the existing one. The
 * post's cached `reactionCount` is updated to reflect the net change so
 * feed cards can render badges without re-aggregating.
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
  if (post.deletedAt) return jsonError("Post removed", 410)

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
    targetType: "post",
    targetId: postId,
    companyId: access.companyId,
    userId: access.session.user.id,
    reactionKey: key,
  })

  // Net-count delta: new reaction → +1, swap → 0, un-react → -1.
  let delta: 1 | -1 | 0 = 0
  if (result.active && !result.previousKey) delta = 1
  else if (!result.active) delta = -1
  if (delta !== 0) {
    await socialPostModel.incrementCounter(postId, "reactionCount", delta)
  }

  const counts = await socialReactionModel.countByTargets("post", [postId])
  return jsonSuccess({
    targetId: postId,
    viewerReaction: result.active ? key : null,
    counts: counts[postId] ?? {},
  })
}
