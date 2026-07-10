import { getDb } from "../client"

const COLLECTION = "system_health_state"

/**
 * Auto-restart için minimal state — tek doküman (key="default"). Her servis
 * için ardışık fail sayısı + en son auto-restart zamanı.
 *
 * Cooldown amaçlı: aynı servis için 10dk içinde 2. auto-restart yok.
 */
export interface SystemHealthState {
  key: "default"
  /** Servis adına göre ardışık fail sayısı. Probe success = 0'a sıfırlanır. */
  consecutiveFailures: Record<string, number>
  /** Son auto-restart timestamp'i (servis adına göre). Cooldown kontrolü. */
  lastAutoRestartAt: Record<string, Date>
  updatedAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function get(): Promise<SystemHealthState> {
  const c = await col()
  const doc = await c.findOne({ key: "default" })
  if (doc) {
    return {
      key: "default",
      consecutiveFailures: (doc.consecutiveFailures as Record<string, number>) ?? {},
      lastAutoRestartAt:
        (doc.lastAutoRestartAt as Record<string, Date>) ?? {},
      updatedAt: (doc.updatedAt as Date) ?? new Date(),
    }
  }
  const fresh: SystemHealthState = {
    key: "default",
    consecutiveFailures: {},
    lastAutoRestartAt: {},
    updatedAt: new Date(),
  }
  await c.insertOne(fresh as unknown as Record<string, unknown>)
  return fresh
}

/** Servis için ardışık fail sayısını artır, döner. */
export async function incrementFailure(service: string): Promise<number> {
  const c = await col()
  const result = await c.findOneAndUpdate(
    { key: "default" },
    { $inc: { [`consecutiveFailures.${service}`]: 1 }, $set: { updatedAt: new Date() } },
    { upsert: true, returnDocument: "after" },
  )
  const current = result?.consecutiveFailures as Record<string, number> | undefined
  return current?.[service] ?? 1
}

/** Servis için fail sayısını sıfırla (probe success). */
export async function resetFailure(service: string): Promise<void> {
  const c = await col()
  await c.updateOne(
    { key: "default" },
    {
      $set: { [`consecutiveFailures.${service}`]: 0, updatedAt: new Date() },
    },
    { upsert: true },
  )
}

/** Auto-restart yapıldığını işaretle — cooldown kontrolünde kullanılır. */
export async function markAutoRestart(service: string): Promise<void> {
  const c = await col()
  const now = new Date()
  await c.updateOne(
    { key: "default" },
    {
      $set: {
        [`lastAutoRestartAt.${service}`]: now,
        [`consecutiveFailures.${service}`]: 0,
        updatedAt: now,
      },
    },
    { upsert: true },
  )
}
