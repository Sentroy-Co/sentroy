import { ObjectId } from "mongodb"
import { getDb } from "@workspace/db/client"
import {
  socialPostModel,
  socialReactionModel,
} from "@workspace/db/models"
import type { SocialPost, SocialComment } from "@workspace/db/types"

interface HydratedAuthor {
  id: string
  name: string
  email: string
  image: string | null
  profileSlug: string | null
  /** Yazarın post'un şirketindeki rolü (owner/admin/member) — badge için. */
  role?: string | null
}

export interface HydratedPost extends SocialPost {
  author: HydratedAuthor | null
  /** Company slug joined from `companies` so the UI can build dashboard
   *  routes (e.g. `/[lang]/d/[slug]/posts/[id]`) without a per-post
   *  lookup round-trip. */
  companySlug: string | null
  repostOfPost:
    | (SocialPost & { author: HydratedAuthor | null })
    | null
  reactionCounts: Record<string, number>
  viewerReaction: string | null
}

export interface HydratedComment extends SocialComment {
  author: HydratedAuthor | null
  reactionCounts: Record<string, number>
  viewerReaction: string | null
}

/**
 * Resolve a list of stringified ObjectIds against the `user` collection.
 * Falls back to string comparison if any id isn't a valid ObjectId so
 * legacy seed data doesn't blow up the timeline render.
 */
async function loadUsers(ids: string[]): Promise<Map<string, HydratedAuthor>> {
  if (ids.length === 0) return new Map()
  const db = await getDb()
  const objectIds: ObjectId[] = []
  for (const id of ids) {
    try {
      objectIds.push(new ObjectId(id))
    } catch {
      /* ignore non-objectid */
    }
  }
  const docs = objectIds.length
    ? await db
        .collection("user")
        .find(
          { _id: { $in: objectIds } },
          {
            projection: {
              _id: 1,
              name: 1,
              email: 1,
              image: 1,
              profileSlug: 1,
            },
          },
        )
        .toArray()
    : []
  const map = new Map<string, HydratedAuthor>()
  for (const d of docs) {
    map.set(d._id.toString(), {
      id: d._id.toString(),
      name: (d.name as string) ?? "",
      email: (d.email as string) ?? "",
      image: (d.image as string | null | undefined) ?? null,
      profileSlug: (d.profileSlug as string | null | undefined) ?? null,
    })
  }
  return map
}

/**
 * Resolve a list of stringified company ids to their slugs in one
 * batch. Used to stamp `companySlug` onto every hydrated post so the UI
 * can build per-company dashboard URLs without re-querying.
 */
async function loadCompanySlugs(
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const db = await getDb()
  const objectIds: ObjectId[] = []
  for (const id of ids) {
    try {
      objectIds.push(new ObjectId(id))
    } catch {
      /* ignore */
    }
  }
  const docs = objectIds.length
    ? await db
        .collection("companies")
        .find(
          { _id: { $in: objectIds } },
          { projection: { _id: 1, slug: 1 } },
        )
        .toArray()
    : []
  const map = new Map<string, string>()
  for (const d of docs) {
    map.set(d._id.toString(), d.slug as string)
  }
  return map
}

/** (companyId:userId) → aktif üye rolü. Yazar rol badge'i için. */
async function loadRoles(
  companyIds: string[],
  userIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (!companyIds.length || !userIds.length) return map
  const db = await getDb()
  const docs = await db
    .collection("company_members")
    .find(
      { companyId: { $in: companyIds }, userId: { $in: userIds }, status: "active" },
      { projection: { companyId: 1, userId: 1, role: 1 } },
    )
    .toArray()
  for (const d of docs) {
    map.set(`${String(d.companyId)}:${String(d.userId)}`, d.role as string)
  }
  return map
}

export async function hydratePosts(
  posts: SocialPost[],
  viewerId: string | null,
): Promise<HydratedPost[]> {
  if (posts.length === 0) return []

  const repostIds = Array.from(
    new Set(posts.map((p) => p.repostOf).filter((v): v is string => !!v)),
  )
  const sourcePosts = repostIds.length
    ? await socialPostModel.findByIds(repostIds)
    : []

  const allUserIds = Array.from(
    new Set([
      ...posts.map((p) => p.authorUserId),
      ...sourcePosts.map((p) => p.authorUserId),
    ]),
  )
  const userMap = await loadUsers(allUserIds)
  const sourceMap = new Map(sourcePosts.map((p) => [p.id, p]))

  const companyIds = Array.from(new Set(posts.map((p) => p.companyId)))
  const slugMap = await loadCompanySlugs(companyIds)
  const roleMap = await loadRoles(companyIds, allUserIds)
  const withRole = (userId: string, companyId: string): HydratedAuthor | null => {
    const base = userMap.get(userId)
    if (!base) return null
    return { ...base, role: roleMap.get(`${companyId}:${userId}`) ?? null }
  }

  const targetIds = posts.map((p) => p.id)
  const counts = await socialReactionModel.countByTargets("post", targetIds)
  const viewerReactions = viewerId
    ? await socialReactionModel.findForUser(viewerId, "post", targetIds)
    : []
  const viewerMap = new Map(
    viewerReactions.map((r) => [r.targetId, r.reactionKey as string]),
  )

  return posts.map<HydratedPost>((p) => {
    const reactionCounts: Record<string, number> = {}
    const raw = counts[p.id] ?? {}
    for (const [key, value] of Object.entries(raw)) {
      reactionCounts[key] = value as number
    }
    return {
      ...p,
      author: withRole(p.authorUserId, p.companyId),
      companySlug: slugMap.get(p.companyId) ?? null,
      repostOfPost: p.repostOf
        ? (() => {
            const src = sourceMap.get(p.repostOf!)
            if (!src) return null
            return { ...src, author: withRole(src.authorUserId, src.companyId) }
          })()
        : null,
      reactionCounts,
      viewerReaction: viewerMap.get(p.id) ?? null,
    }
  })
}

export async function hydrateComments(
  comments: SocialComment[],
  viewerId: string | null,
): Promise<HydratedComment[]> {
  if (comments.length === 0) return []

  const userIds = Array.from(new Set(comments.map((c) => c.authorUserId)))
  const userMap = await loadUsers(userIds)

  const targetIds = comments.map((c) => c.id)
  const counts = await socialReactionModel.countByTargets("comment", targetIds)
  const viewerReactions = viewerId
    ? await socialReactionModel.findForUser(viewerId, "comment", targetIds)
    : []
  const viewerMap = new Map(
    viewerReactions.map((r) => [r.targetId, r.reactionKey as string]),
  )

  return comments.map<HydratedComment>((c) => {
    const reactionCounts: Record<string, number> = {}
    const raw = counts[c.id] ?? {}
    for (const [key, value] of Object.entries(raw)) {
      reactionCounts[key] = value as number
    }
    return {
      ...c,
      author: userMap.get(c.authorUserId) ?? null,
      reactionCounts,
      viewerReaction: viewerMap.get(c.id) ?? null,
    }
  })
}
