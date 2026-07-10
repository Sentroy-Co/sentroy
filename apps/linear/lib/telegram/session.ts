/**
 * /talep FSM oturumu (triage session.server.ts portu — SQLite → Mongo).
 * Key = {companyId, chatId}. Durum + taslak (takım, önem, metin segmentleri,
 * foto file_id'leri, canlı kart message_id, idempotency_key) kalıcı tutulur.
 * 30dk lazy-expire (getSession çağrısında) — triage ile birebir.
 *
 * Triage'dan fark: kategori ağacı yerine LINEAR TAKIMI seçilir (teamId);
 * media_group_buffer alanı kaynak flow'da hiç kullanılmadığından port edilmedi.
 */

import { getDb } from "@workspace/db/client"
import { SESSIONS, SESSION_TTL_MS } from "./store"

export type SessionState =
  | "AWAIT_TEAM"
  | "AWAIT_PRIORITY"
  | "AWAIT_TITLE"
  | "AWAIT_DETAILS"
  | "AWAIT_CONFIRM"
  | "SUBMITTING"

/** /talep taslağındaki kullanıcı mesajları — mesaj-id bazlı, düzenleme yakalama
 *  için. slot=title tek başlık segmenti; slot=detail açıklama segmentleri. */
export type DraftSegment = {
  id: number
  slot: "title" | "detail"
  text: string
}

export type TelegramSession = {
  companyId: string
  chatId: string
  tgUserId: string
  state: SessionState
  teamId: string | null
  priority: number | null
  draftText: string | null
  draftSegments: DraftSegment[]
  draftPhotos: string[]
  cardMessageId: string | null
  idempotencyKey: string | null
  lastUpdateId: number | null
}

type SessionDoc = TelegramSession & { createdAt: Date; updatedAt: Date }

async function col() {
  const db = await getDb()
  return db.collection<SessionDoc>(SESSIONS)
}

/** Oturumu getir; 30dk'dan eskiyse expired say (sil) ve null dön. */
export async function getSession(
  companyId: string,
  chatId: string | number,
): Promise<TelegramSession | null> {
  const c = await col()
  const doc = await c.findOne({ companyId, chatId: String(chatId) })
  if (!doc) return null
  if (Date.now() - doc.updatedAt.getTime() > SESSION_TTL_MS) {
    await c.deleteOne({ companyId, chatId: String(chatId) })
    return null
  }
  const { createdAt: _c, updatedAt: _u, ...session } = doc
  return session
}

/** Yeni /talep oturumu (AWAIT_TEAM). Mevcut varsa sıfırlar (triage upsert deseni). */
export async function createSession(
  companyId: string,
  chatId: string | number,
  tgUserId: string | number,
): Promise<TelegramSession> {
  const c = await col()
  const now = new Date()
  const fresh: Omit<SessionDoc, "createdAt"> = {
    companyId,
    chatId: String(chatId),
    tgUserId: String(tgUserId),
    state: "AWAIT_TEAM",
    teamId: null,
    priority: null,
    draftText: null,
    draftSegments: [],
    draftPhotos: [],
    cardMessageId: null,
    idempotencyKey: null,
    lastUpdateId: null,
    updatedAt: now,
  }
  await c.updateOne(
    { companyId, chatId: String(chatId) },
    { $set: fresh, $setOnInsert: { createdAt: now } },
    { upsert: true },
  )
  return { ...fresh } as TelegramSession
}

export async function patchSession(
  companyId: string,
  chatId: string | number,
  patch: Partial<
    Pick<
      TelegramSession,
      | "state"
      | "teamId"
      | "priority"
      | "draftText"
      | "draftSegments"
      | "draftPhotos"
      | "cardMessageId"
      | "idempotencyKey"
      | "lastUpdateId"
    >
  >,
): Promise<void> {
  if (Object.keys(patch).length === 0) return
  const c = await col()
  await c.updateOne(
    { companyId, chatId: String(chatId) },
    { $set: { ...patch, updatedAt: new Date() } },
  )
}

export async function clearSession(
  companyId: string,
  chatId: string | number,
): Promise<void> {
  const c = await col()
  await c.deleteOne({ companyId, chatId: String(chatId) })
}

/** TTL'i geçmiş TÜM oturumları sil (temizlik — tüm şirketler). Silinen sayısı. */
export async function purgeExpiredSessions(): Promise<number> {
  const c = await col()
  const cutoff = new Date(Date.now() - SESSION_TTL_MS)
  const res = await c.deleteMany({ updatedAt: { $lt: cutoff } })
  return res.deletedCount
}
