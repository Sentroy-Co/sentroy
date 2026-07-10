import { getDb } from "../client"
import { toId } from "./_helpers"

const COLLECTION = "env_audit_log"

/**
 * Env-vault için ayrı bir audit log — değişikliği yapan user, etkilenen
 * project/environment/key, action, timestamp. Değer kendisi YAZILMAZ
 * (audit log da dahil hiçbir doc'ta plaintext value yok). Eski/yeni
 * checksum'lar (sha-256) saklanır → hangi değişikliğin değer-bazlı
 * olduğu, hangisinin sadece metadata değişikliği (description, public
 * flag) anlaşılır.
 */
export type EnvAuditAction =
  | "project.create"
  | "project.update"
  | "project.delete"
  | "variable.create"
  | "variable.update"
  | "variable.delete"
  | "token.create"
  | "token.delete"
  | "webhook.create"
  | "webhook.update"
  | "webhook.delete"

export interface EnvAuditLog {
  id: string
  action: EnvAuditAction
  projectId: string
  environment: string | null
  key: string | null
  /** Action'ı yapan user'ın id'si. */
  actorId: string
  /** Opsiyonel actor email — UI'da hızlı render için cache. */
  actorEmail: string | null
  /** Eski değerin SHA-256 checksum'ı (varsa). */
  beforeChecksum: string | null
  /** Yeni değerin SHA-256 checksum'ı (varsa). */
  afterChecksum: string | null
  /** Action'a özel free-form metadata (örn. token name, change diff). */
  meta: Record<string, unknown>
  createdAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function log(input: {
  action: EnvAuditAction
  projectId: string
  environment?: string | null
  key?: string | null
  actorId: string
  actorEmail?: string | null
  beforeChecksum?: string | null
  afterChecksum?: string | null
  meta?: Record<string, unknown>
}): Promise<void> {
  const c = await col()
  await c.insertOne({
    action: input.action,
    projectId: input.projectId,
    environment: input.environment ?? null,
    key: input.key ?? null,
    actorId: input.actorId,
    actorEmail: input.actorEmail ?? null,
    beforeChecksum: input.beforeChecksum ?? null,
    afterChecksum: input.afterChecksum ?? null,
    meta: input.meta ?? {},
    createdAt: new Date(),
  })
}

export async function findByProject(
  projectId: string,
  limit = 100,
): Promise<EnvAuditLog[]> {
  const c = await col()
  const docs = await c
    .find({ projectId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray()
  return docs.map(toId)
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ projectId: 1, createdAt: -1 })
}
