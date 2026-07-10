import { ObjectId } from "mongodb"
import { getDb } from "../client"
import type { ReactionKey, SocialReaction } from "../types"
import { toId } from "./_helpers"

const COLLECTION = "social_reactions"

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

interface ToggleInput {
  targetType: "post" | "comment"
  targetId: string
  companyId: string
  userId: string
  reactionKey: ReactionKey
}

/**
 * Toggle a single user's reaction on a target. If the user already has
 * that exact reactionKey on the target → delete it (un-react). If they
 * had a different reactionKey on the same target → swap it. If they had
 * none → insert a new one. Returns the resulting state so the API
 * doesn't need a follow-up read.
 *
 * The unique compound index `(targetType, targetId, userId)` enforces
 * "one reaction per user per target" at the DB level, but we still do
 * the swap explicitly to avoid surfacing duplicate-key errors to the
 * caller and to keep the parent post's `reactionCount` from drifting.
 */
export async function toggle(input: ToggleInput): Promise<{
  active: boolean
  previousKey: ReactionKey | null
}> {
  const c = await col()
  const filter = {
    targetType: input.targetType,
    targetId: input.targetId,
    userId: input.userId,
  }
  const existing = (await c.findOne(filter)) as
    | (SocialReaction & { _id: ObjectId })
    | null
  if (existing) {
    if (existing.reactionKey === input.reactionKey) {
      await c.deleteOne({ _id: existing._id })
      return { active: false, previousKey: existing.reactionKey }
    }
    await c.updateOne(
      { _id: existing._id },
      { $set: { reactionKey: input.reactionKey, createdAt: new Date() } },
    )
    return { active: true, previousKey: existing.reactionKey }
  }
  await c.insertOne({
    targetType: input.targetType,
    targetId: input.targetId,
    companyId: input.companyId,
    userId: input.userId,
    reactionKey: input.reactionKey,
    createdAt: new Date(),
  })
  return { active: true, previousKey: null }
}

export async function findForUser(
  userId: string,
  targetType: "post" | "comment",
  targetIds: string[],
): Promise<Array<Pick<SocialReaction, "targetId" | "reactionKey">>> {
  if (targetIds.length === 0) return []
  const c = await col()
  const docs = await c
    .find({ userId, targetType, targetId: { $in: targetIds } })
    .project({ targetId: 1, reactionKey: 1, _id: 0 })
    .toArray()
  return docs as Array<Pick<SocialReaction, "targetId" | "reactionKey">>
}

/**
 * Aggregate per-key counts for a set of targets. Returns a map keyed by
 * `targetId` with counts split per ReactionKey — feed/detail UIs use
 * this to render the picker's stacked tally.
 */
export async function countByTargets(
  targetType: "post" | "comment",
  targetIds: string[],
): Promise<Record<string, Partial<Record<ReactionKey, number>>>> {
  if (targetIds.length === 0) return {}
  const c = await col()
  const rows = await c
    .aggregate([
      { $match: { targetType, targetId: { $in: targetIds } } },
      {
        $group: {
          _id: { targetId: "$targetId", reactionKey: "$reactionKey" },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray()
  const out: Record<string, Partial<Record<ReactionKey, number>>> = {}
  for (const row of rows) {
    const targetId = row._id.targetId as string
    const key = row._id.reactionKey as ReactionKey
    if (!out[targetId]) out[targetId] = {}
    out[targetId]![key] = row.count as number
  }
  return out
}

export async function clearForTarget(
  targetType: "post" | "comment",
  targetId: string,
): Promise<void> {
  const c = await col()
  await c.deleteMany({ targetType, targetId })
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex(
    { targetType: 1, targetId: 1, userId: 1 },
    { unique: true },
  )
  await c.createIndex({ targetType: 1, targetId: 1, reactionKey: 1 })
  await c.createIndex({ companyId: 1, createdAt: -1 })
}
