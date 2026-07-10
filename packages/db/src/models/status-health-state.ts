import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "status_health_state"

/**
 * Per-check failure counter + restart cooldown — Sentroy internal'ın
 * `system_health_state` pattern'inin per-check versiyonu.
 *
 * Auto-restart logic'i (Phase 7):
 *   - Probe sonucu down → `consecutiveFailures` artır
 *   - Probe operational → `consecutiveFailures` sıfırla
 *   - `consecutiveFailures >= check.restartFailureThreshold` VE
 *     `now - lastRestartAt >= check.restartCooldownSeconds` ise restart
 *     target tetiklenir.
 *   - Restart sonrası `lastRestartAt` set edilir, counter sıfırlanmaz
 *     (sonraki probe başarılıysa kendisi sıfırlar).
 *
 * Tek doc per check (upsert pattern'i). `_id` doc generated, asıl key
 * `checkId`.
 */

export interface StatusHealthState {
  id: string
  checkId: string
  consecutiveFailures: number
  lastFailureAt: Date | null
  lastRestartAt: Date | null
  /** Bugüne kadar tetiklenmiş restart sayısı (audit/UI için). */
  totalRestartsTriggered: number
  /** Bugün tetiklenmiş restart sayısı — günlük cap için
   *  (`restartMaxPerDay` Phase 7'de check'e eklenir). */
  restartsToday: number
  restartsTodayResetAt: Date
  updatedAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

// ─── Queries ──────────────────────────────────────────────────────────────

export async function findByCheck(
  checkId: string,
): Promise<StatusHealthState | null> {
  const c = await col()
  const doc = await c.findOne({ checkId })
  return doc ? toId(doc) : null
}

// ─── Mutations ────────────────────────────────────────────────────────────

/**
 * Probe down sonucunda — counter +1, lastFailureAt set. Eğer doc yoksa
 * yarat. Returns updated state (consumer threshold check yapar).
 */
export async function recordFailure(checkId: string): Promise<StatusHealthState> {
  const c = await col()
  const now = new Date()
  const result = await c.findOneAndUpdate(
    { checkId },
    {
      $inc: { consecutiveFailures: 1 },
      $set: { lastFailureAt: now, updatedAt: now },
      $setOnInsert: {
        checkId,
        lastRestartAt: null,
        totalRestartsTriggered: 0,
        restartsToday: 0,
        restartsTodayResetAt: now,
      },
    },
    { upsert: true, returnDocument: "after" },
  )
  return toId(result!)
}

/**
 * Probe operational sonucunda — counter sıfırla. Hiç doc yoksa no-op.
 */
export async function recordSuccess(checkId: string): Promise<void> {
  const c = await col()
  await c.updateOne(
    { checkId },
    {
      $set: {
        consecutiveFailures: 0,
        updatedAt: new Date(),
      },
    },
  )
}

/**
 * Restart tetiklendiğinde — `lastRestartAt`, `totalRestartsTriggered`,
 * `restartsToday` günceller. `restartsTodayResetAt` 24h geçmişse counter
 * sıfırlanır (rolling daily cap).
 */
export async function recordRestart(
  checkId: string,
): Promise<StatusHealthState> {
  const c = await col()
  const now = new Date()
  const existing = await c.findOne({ checkId })
  const oneDayMs = 24 * 60 * 60 * 1000

  if (
    existing?.restartsTodayResetAt &&
    now.getTime() - new Date(existing.restartsTodayResetAt).getTime() < oneDayMs
  ) {
    // Aynı 24h penceresi — increment
    const updated = await c.findOneAndUpdate(
      { checkId },
      {
        $inc: { totalRestartsTriggered: 1, restartsToday: 1 },
        $set: { lastRestartAt: now, updatedAt: now },
      },
      { returnDocument: "after" },
    )
    return toId(updated!)
  }

  // Yeni 24h penceresi — counter sıfırla
  const updated = await c.findOneAndUpdate(
    { checkId },
    {
      $inc: { totalRestartsTriggered: 1 },
      $set: {
        restartsToday: 1,
        restartsTodayResetAt: now,
        lastRestartAt: now,
        updatedAt: now,
      },
      $setOnInsert: {
        checkId,
        consecutiveFailures: 0,
        lastFailureAt: null,
      },
    },
    { upsert: true, returnDocument: "after" },
  )
  return toId(updated!)
}

export async function reset(checkId: string): Promise<void> {
  const c = await col()
  await c.updateOne(
    { checkId },
    {
      $set: {
        consecutiveFailures: 0,
        lastFailureAt: null,
        updatedAt: new Date(),
      },
    },
  )
}

export async function removeByCheck(checkId: string): Promise<boolean> {
  const c = await col()
  const r = await c.deleteOne({ checkId })
  return r.deletedCount === 1
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ checkId: 1 }, { unique: true })
}
