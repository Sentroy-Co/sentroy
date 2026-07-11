export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import { socialPostModel } from "@workspace/db/models"
import { hydratePosts } from "@/lib/social/hydrate"

/**
 * GET — bir post'un doğrudan yanıtları (comments-as-posts: parentId=postId olan
 * postlar). Her yanıt tam bir post (reaksiyon/yanıt/repost) → PostCard ile
 * render edilir. Gizlilik viewer'a göre filtrelenir (findReplies). Yanıt
 * OLUŞTURMA ayrı bir endpoint değil — `POST /posts` `parentId` ile yapılır.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; postId: string }> },
) {
  const { slug, postId } = await params
  const access = await assertCompanyAccess(request, slug)
  if ("error" in access) return access.error

  const viewerId = access.session?.user.id ?? null
  const isAdmin =
    (access.session?.user as { role?: string } | undefined)?.role === "admin" ||
    access.member?.role === "owner" ||
    access.member?.role === "admin"

  const replies = await socialPostModel.findReplies(postId, {
    userId: viewerId ?? "",
    isAdmin,
  })
  const hydrated = await hydratePosts(replies, viewerId)
  return jsonSuccess({ replies: hydrated })
}
