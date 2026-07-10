import { getDb } from "../client"
import type { AuditLog } from "../types"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "audit_logs"

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function insert(
  data: Omit<AuditLog, "id" | "createdAt">,
): Promise<AuditLog> {
  const c = await col()
  const now = new Date()
  const result = await c.insertOne({
    ...data,
    createdAt: now,
  })
  return {
    id: result.insertedId.toString(),
    ...data,
    createdAt: now,
  }
}

export async function findByCompany(
  companyId: string,
  opts?: {
    limit?: number
    skip?: number
    action?: string
    /** Regex prefix — örn. "status-page.*" tüm status page audit'leri. */
    actionPrefix?: string
    /** Sadece bu tarihten itibaren olan kayıtlar (analytics aggregation için). */
    sinceDate?: Date
  },
): Promise<AuditLog[]> {
  const c = await col()
  const filter: Record<string, unknown> = { companyId }
  if (opts?.action) filter.action = opts.action
  else if (opts?.actionPrefix) {
    filter.action = {
      $regex: `^${opts.actionPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    }
  }
  if (opts?.sinceDate) {
    filter.createdAt = { $gte: opts.sinceDate }
  }

  let cursor = c.find(filter).sort({ createdAt: -1 })
  if (opts?.skip) cursor = cursor.skip(opts.skip)
  if (opts?.limit) cursor = cursor.limit(opts.limit)

  const docs = await cursor.toArray()
  return docs.map(toId)
}

export async function findByUser(
  userId: string,
  opts?: {
    limit?: number
    skip?: number
    /** Sadece bu action'lardan birini içeren kayıtlar. */
    actions?: string[]
  },
): Promise<AuditLog[]> {
  const c = await col()

  const filter: Record<string, unknown> = { userId }
  if (opts?.actions && opts.actions.length > 0) {
    filter.action = { $in: opts.actions }
  }
  let cursor = c.find(filter).sort({ createdAt: -1 })
  if (opts?.skip) cursor = cursor.skip(opts.skip)
  if (opts?.limit) cursor = cursor.limit(opts.limit)

  const docs = await cursor.toArray()
  return docs.map(toId)
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ companyId: 1, createdAt: -1 })
  await c.createIndex({ userId: 1, createdAt: -1 })
}
