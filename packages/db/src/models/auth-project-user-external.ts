import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "auth_project_user_externals"

/**
 * External identity link — bir auth-user'ın Google/GitHub/... gibi dış
 * provider hesabıyla bağlanması. Sonraki social login'de external_id'den
 * user'a hızlıca map eder.
 */

export type SocialProvider =
  | "google"
  | "github"
  | "facebook"
  | "microsoft"
  | "twitter"
  | "apple"

export interface AuthProjectUserExternal {
  id: string
  authProjectId: string
  userId: string
  provider: SocialProvider
  /** Provider'ın stable kullanıcı id'si (Google sub, GitHub id). */
  externalId: string
  /** Provider'dan gelen email (linkage debug + UI display). */
  externalEmail: string | null
  createdAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function findByExternal(
  authProjectId: string,
  provider: SocialProvider,
  externalId: string,
): Promise<AuthProjectUserExternal | null> {
  const c = await col()
  const doc = await c.findOne({ authProjectId, provider, externalId })
  return doc ? toId(doc) : null
}

export async function listByUser(
  userId: string,
): Promise<AuthProjectUserExternal[]> {
  const c = await col()
  const docs = await c.find({ userId }).toArray()
  return docs.map((d) => toId(d) as AuthProjectUserExternal)
}

export async function create(input: {
  authProjectId: string
  userId: string
  provider: SocialProvider
  externalId: string
  externalEmail?: string | null
}): Promise<AuthProjectUserExternal> {
  const c = await col()
  const now = new Date()
  const doc = {
    authProjectId: input.authProjectId,
    userId: input.userId,
    provider: input.provider,
    externalId: input.externalId,
    externalEmail: input.externalEmail ?? null,
    createdAt: now,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

export async function remove(id: string, userId: string): Promise<boolean> {
  const c = await col()
  const r = await c.deleteOne({ _id: toObjectId(id), userId })
  return (r.deletedCount ?? 0) > 0
}

export async function removeByUser(userId: string): Promise<number> {
  const c = await col()
  const r = await c.deleteMany({ userId })
  return r.deletedCount ?? 0
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex(
    { authProjectId: 1, provider: 1, externalId: 1 },
    { unique: true },
  )
  await c.createIndex({ userId: 1 })
}
