/**
 * Telegram temizlik + KVKK saklama (triage cleanup.server.ts portu).
 * Runner döngüsünde günde bir çalıştırılır (in-memory throttle — tek replica):
 *  - terk edilen FSM oturumları (TTL geçmiş),
 *  - eski update_id dedup kayıtları (>24h),
 *  - KVKK: linear_telegram_requests snapshot alanları
 *    (tgUsername/tgDisplayName/chatId) saklama süresi sonrası maskelenir;
 *    operasyonel alanlar (issueIdentifier/priority/teamName) korunur.
 *
 * NOT (KVKK kalıcı atıf): Linear açıklamasındaki `> App User: tg_<id>` ve
 * panel attachment'taki minimal Telegram alanları Linear'da KALICIDIR; buradan
 * silinemez. En hassas atıf (username/chat_id) yalnız linear_telegram_requests
 * içinde tutulur ve burada süre sonunda maskelenir.
 */

import { getDb } from "@workspace/db/client"
import { logger } from "../logger"
import { purgeExpiredSessions } from "./session"
import { purgeSeenUsers, REQUESTS, UPDATES } from "./store"

// KVKK saklama süresi (gün) — triage ile aynı. İleride config'lenebilir.
const RETENTION_DAYS = 365

/** Eski dedup kayıtlarını temizle — 24 saatten eski. Silinen sayısı. */
async function purgeOldProcessedUpdates(): Promise<number> {
  const db = await getDb()
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000)
  const res = await db
    .collection(UPDATES)
    .deleteMany({ processedAt: { $lt: cutoff } })
  return res.deletedCount
}

/** Saklama süresi geçmiş request kayıtlarının hassas alanlarını maskeler. */
async function purgeTelegramRequestPII(days = RETENTION_DAYS): Promise<number> {
  const db = await getDb()
  const cutoff = new Date(Date.now() - days * 86_400_000)
  const res = await db.collection(REQUESTS).updateMany(
    {
      createdAt: { $lt: cutoff },
      $or: [
        { tgUsername: { $ne: null } },
        { tgDisplayName: { $ne: null } },
        { chatId: { $ne: null } },
      ],
    },
    { $set: { tgUsername: null, tgDisplayName: null, chatId: null } },
  )
  return res.modifiedCount
}

/** Tüm Telegram temizlik işlerini bir kez çalıştırır (throttle çağıran tarafta). */
export async function runTelegramCleanupOnce(): Promise<{
  sessions: number
  updates: number
  pii: number
  seen: number
}> {
  const sessions = await purgeExpiredSessions()
  const updates = await purgeOldProcessedUpdates()
  const pii = await purgeTelegramRequestPII()
  // Keşif (dinleme modu) kimlikleri — 15 dk'yı geçenler global temizlenir
  // (asıl temizlik GET telegram-seen + discovery kapanışında; bu güvenlik ağı).
  const seen = await purgeSeenUsers()
  logger.info({
    source: "telegram",
    message: "cleanup",
    sessions,
    updates,
    pii,
    seen,
  })
  return { sessions, updates, pii, seen }
}

// Günde-bir throttle (in-memory — poller tek replica olduğundan yeterli).
let lastCleanupAt = 0

export async function maybeRunTelegramCleanup(): Promise<void> {
  if (Date.now() - lastCleanupAt < 24 * 3600 * 1000) return
  lastCleanupAt = Date.now()
  try {
    await runTelegramCleanupOnce()
  } catch (e) {
    logger.error({
      source: "telegram",
      message: "cleanup hata",
      error: (e as Error).message,
    })
  }
}
