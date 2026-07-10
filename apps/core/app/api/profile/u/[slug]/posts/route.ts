import { NextRequest } from "next/server"
import {
  getAuthSession,
  jsonError,
  jsonSuccess,
} from "@workspace/console/lib/api-helpers"
import { getDb } from "@workspace/db/client"
import {
  socialPostModel,
  companyMemberModel,
} from "@workspace/db/models"
import { hydratePosts } from "@/lib/social/hydrate"

/**
 * GET /api/profile/u/[slug]/posts
 *
 * Returns the public feed for the user identified by `slug`. Because
 * post visibility is intranet-only (each post is scoped to a single
 * company), this endpoint intersects:
 *   - the *target* user's active company memberships, and
 *   - the *viewer's* active company memberships.
 *
 * The returned set is the union of posts authored by the target inside
 * any company that both parties belong to. An anonymous viewer (or one
 * with no overlapping companies) gets an empty array — never a 401, so
 * the public profile page can render the empty-state without auth
 * branching.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  if (!slug) return jsonError("Slug required", 400)

  const db = await getDb()
  const target = await db.collection("user").findOne(
    { profileSlug: slug.toLowerCase(), isPublicProfile: true },
    { projection: { _id: 1 } },
  )
  if (!target) return jsonError("Profile not found", 404)
  const targetId = target._id.toString()

  const session = await getAuthSession(request)
  const viewerId = session?.user.id ?? null

  if (!viewerId) {
    return jsonSuccess({ posts: [] })
  }

  const [targetMemberships, viewerMemberships] = await Promise.all([
    companyMemberModel.findByUser(targetId),
    companyMemberModel.findByUser(viewerId),
  ])
  const viewerSet = new Set(
    viewerMemberships
      .filter((m) => m.status === "active")
      .map((m) => m.companyId),
  )
  const sharedCompanyIds = targetMemberships
    .filter((m) => m.status === "active" && viewerSet.has(m.companyId))
    .map((m) => m.companyId)

  if (sharedCompanyIds.length === 0) {
    return jsonSuccess({ posts: [] })
  }

  const tabRaw = new URL(request.url).searchParams.get("tab")
  const tab =
    tabRaw === "replies" || tabRaw === "reposts" || tabRaw === "posts"
      ? tabRaw
      : undefined
  const posts = await socialPostModel.findByAuthorInCompanies(
    targetId,
    sharedCompanyIds,
    // Profil bağlamında per-company admin hesaplaması karmaşık → konservatif:
    // viewer public/members + kendi postlarını görür (admins-only gizli kalır).
    { userId: viewerId ?? "", isAdmin: false },
    { limit: 30, tab },
  )
  const hydrated = await hydratePosts(posts, viewerId)
  return jsonSuccess({ posts: hydrated })
}
