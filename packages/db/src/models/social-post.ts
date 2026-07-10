import { ObjectId } from "mongodb"
import { getDb } from "../client"
import type {
  SocialPost,
  SocialPostAttachment,
  SocialPostVisibility,
} from "../types"
import { toId } from "./_helpers"

const COLLECTION = "social_posts"

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

interface CreateInput {
  companyId: string
  authorUserId: string
  text: string
  bodyHtml?: string | null
  mentions?: string[]
  attachments?: SocialPostAttachment[]
  repostOf?: string | null
  /** Yanıt zinciri (comments-as-posts). null → top-level post. */
  parentId?: string | null
  rootId?: string | null
  visibility?: SocialPostVisibility
}

export async function create(data: CreateInput): Promise<SocialPost> {
  const c = await col()
  const now = new Date()
  const doc = {
    companyId: data.companyId,
    authorUserId: data.authorUserId,
    text: data.text,
    bodyHtml: data.bodyHtml ?? null,
    mentions: data.mentions ?? [],
    attachments: data.attachments ?? [],
    repostOf: data.repostOf ?? null,
    parentId: data.parentId ?? null,
    rootId: data.rootId ?? null,
    visibility: data.visibility ?? ("members" as SocialPostVisibility),
    commentCount: 0,
    reactionCount: 0,
    repostCount: 0,
    deletedAt: null as Date | null,
    createdAt: now,
    updatedAt: now,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

/**
 * Gizlilik Mongo filtresi — viewer'ın görebileceği postlar.
 *  - `public`/`members`/(eski: alan yok) → tüm aktif üyeler görür
 *  - kendi postları (her gizlilikte) → yazar görür
 *  - `admins` → owner/admin görür
 */
export function buildVisibilityFilter(
  viewerUserId: string,
  isAdmin: boolean,
): Record<string, unknown> {
  const or: Record<string, unknown>[] = [
    { visibility: { $in: ["public", "members", null] } },
    { authorUserId: viewerUserId },
  ]
  if (isAdmin) or.push({ visibility: "admins" })
  return { $or: or }
}

export async function findById(id: string): Promise<SocialPost | null> {
  if (!ObjectId.isValid(id)) return null
  const c = await col()
  const doc = await c.findOne({ _id: new ObjectId(id) })
  return doc ? (toId(doc) as SocialPost) : null
}

/**
 * Hydrates a list of post ids in a single round-trip. Used when an API
 * needs to attach `repostOf` source posts to a feed payload — looking
 * them up one-by-one would explode N+1 on a busy timeline.
 */
export async function findByIds(ids: string[]): Promise<SocialPost[]> {
  if (ids.length === 0) return []
  const valid = ids.filter((id) => ObjectId.isValid(id))
  if (valid.length === 0) return []
  const c = await col()
  const docs = await c
    .find({ _id: { $in: valid.map((id) => new ObjectId(id)) } })
    .toArray()
  return docs.map(toId) as SocialPost[]
}

export async function findCompanyTimeline(
  companyId: string,
  viewer: { userId: string; isAdmin: boolean },
  opts?: {
    limit?: number
    before?: Date
    tab?: "posts" | "replies" | "reposts"
  },
): Promise<SocialPost[]> {
  const c = await col()
  const filter: Record<string, unknown> = {
    companyId,
    deletedAt: null,
    ...buildVisibilityFilter(viewer.userId, viewer.isAdmin),
  }
  // Profil tabları (company timeline filtresi):
  //  default = tüm top-level (repost dahil) · posts = orijinaller ·
  //  replies = yanıtlar · reposts = repostlar
  if (opts?.tab === "replies") {
    filter.parentId = { $ne: null }
  } else if (opts?.tab === "reposts") {
    filter.parentId = null
    filter.repostOf = { $ne: null }
  } else if (opts?.tab === "posts") {
    filter.parentId = null
    filter.repostOf = null
  } else {
    // Yanıtlar timeline'da görünmez; reposts top-level olarak kalır.
    filter.parentId = null
  }
  if (opts?.before) filter.createdAt = { $lt: opts.before }
  const docs = await c
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(opts?.limit ?? 30)
    .toArray()
  return docs.map(toId) as SocialPost[]
}

/**
 * Bir post'un doğrudan yanıtları (parentId = postId). Thread görünümü her
 * seviyeyi ayrı çağırır ya da rootId ile tüm thread çekilir. Eskiden yeniye.
 */
export async function findReplies(
  parentId: string,
  viewer: { userId: string; isAdmin: boolean },
  opts?: { limit?: number },
): Promise<SocialPost[]> {
  const c = await col()
  const docs = await c
    .find({
      parentId,
      deletedAt: null,
      ...buildVisibilityFilter(viewer.userId, viewer.isAdmin),
    })
    .sort({ createdAt: 1 })
    .limit(opts?.limit ?? 100)
    .toArray()
  return docs.map(toId) as SocialPost[]
}

/**
 * Posts authored by `userId` inside the set of companies the viewer is
 * also a member of. Caller is responsible for resolving the
 * intersection of (target user's companies) and (viewer's companies)
 * and passing the result here. An empty `companyIds` short-circuits to
 * `[]` — non-overlapping company members shouldn't see each other's
 * activity.
 */
export async function findByAuthorInCompanies(
  authorUserId: string,
  companyIds: string[],
  viewer: { userId: string; isAdmin: boolean },
  opts?: { limit?: number; tab?: "posts" | "replies" | "reposts" },
): Promise<SocialPost[]> {
  if (companyIds.length === 0) return []
  const c = await col()
  const filter: Record<string, unknown> = {
    authorUserId,
    companyId: { $in: companyIds },
    deletedAt: null,
    ...buildVisibilityFilter(viewer.userId, viewer.isAdmin),
  }
  // Profil tabları: posts = top-level orijinal, replies = yanıt, reposts = repost.
  if (opts?.tab === "posts") {
    filter.parentId = null
    filter.repostOf = null
  } else if (opts?.tab === "replies") {
    filter.parentId = { $ne: null }
  } else if (opts?.tab === "reposts") {
    filter.repostOf = { $ne: null }
  }
  const docs = await c
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(opts?.limit ?? 30)
    .toArray()
  return docs.map(toId) as SocialPost[]
}

export async function softDelete(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false
  const c = await col()
  const res = await c.updateOne(
    { _id: new ObjectId(id), deletedAt: null },
    { $set: { deletedAt: new Date(), updatedAt: new Date() } },
  )
  return res.modifiedCount > 0
}

export async function incrementCounter(
  id: string,
  field: "commentCount" | "reactionCount" | "repostCount",
  delta: 1 | -1,
): Promise<void> {
  if (!ObjectId.isValid(id)) return
  const c = await col()
  await c.updateOne(
    { _id: new ObjectId(id) },
    {
      $inc: { [field]: delta },
      $set: { updatedAt: new Date() },
    },
  )
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ companyId: 1, createdAt: -1, deletedAt: 1 })
  await c.createIndex({ authorUserId: 1, createdAt: -1, deletedAt: 1 })
  await c.createIndex({ repostOf: 1 })
  // Comments-as-posts: top-level akış + yanıt zinciri sorguları.
  await c.createIndex({ companyId: 1, parentId: 1, createdAt: -1 })
  await c.createIndex({ parentId: 1, createdAt: 1 })
  await c.createIndex({ rootId: 1, createdAt: 1 })
}
