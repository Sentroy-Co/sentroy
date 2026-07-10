/**
 * Telegram bot'unun Mongo erişim katmanı (triage SQLite tabloları → düz
 * koleksiyonlar; packages/db'ye model EKLENMEDİ — mevcut linear app
 * getDb() deseni). Koleksiyonlar:
 *
 *  - linear_telegram_sessions  → /talep FSM oturumu (chat state machine)
 *  - linear_telegram_requests  → telegram request ↔ Linear issueId eşlemesi
 *  - linear_telegram_updates   → update_id dedup (24h saklama, cleanup budar)
 *  - linear_telegram_seen      → operatör keşfi (dinleme modu) kimlikleri —
 *    yalnız KİMLİK yazılır (KVKK: mesaj içeriği ASLA yazılmaz), 15 dk saklama
 *
 * Hepsi companyId-scoped (tenant izolasyonu). Offset gibi runtime meta'lar
 * linear_settings.telegram.* alanlarına dot-path ile yazılır (tüm subdoc'u
 * ezmemek için — settings PUT ile yarışabilir; bkz. bumpTelegramOffset).
 */

import { getDb } from "@workspace/db/client"
import { ObjectId } from "mongodb"
import type {
  LinearTelegramOperator,
  LinearTelegramSettings,
} from "@workspace/db/models/linear-settings"
import { safeDecrypt } from "../settings"
import { normalizeBotLang, type BotLang } from "./messages"
import type { TelegramApi, TgUser } from "./api"

export const SESSIONS = "linear_telegram_sessions"
export const REQUESTS = "linear_telegram_requests"
export const UPDATES = "linear_telegram_updates"
export const SEEN = "linear_telegram_seen"

/** Oturum TTL'i — triage ile aynı (30dk lazy-expire). */
export const SESSION_TTL_MS = 30 * 60 * 1000

/** Keşif (seen) kayıtlarının saklama süresi — kısa tutulur (KVKK). */
export const SEEN_TTL_MS = 15 * 60 * 1000

export type { LinearTelegramOperator }

// --- Operatör yetkilendirme (triage auth.server.ts portu) ------------------
// Allowlist company-scoped: linear_settings.telegram.operators (zengin şema);
// legacy operatorIds okuma sırasında default yetkilerle map'lenir.
// username uçucu olduğundan anahtar olarak KULLANILMAZ; yalnız numeric user_id.

export const OPERATOR_ID_RE = /^\d{3,}$/

/** teamAccess'i garanti mevcut (normalize edilmiş) operatör kaydı. */
export type ResolvedTelegramOperator = LinearTelegramOperator & {
  teamAccess: "all" | string | null
}

/**
 * GERİYE UYUM: zengin `operators` varsa onu kullan; yoksa legacy
 * `operatorIds`'i tüm yetkiler açık (memberUserId null) olarak map'le.
 * teamAccess normalizasyonu: alan EKSİKSE (teamAccess'ten önce yazılmış
 * kayıt / legacy map) "all" kabul edilir — çalışan operatör kırılmaz;
 * UI'dan yeni eklenenler explicit null ile başlar.
 */
export function resolveOperators(
  telegram:
    | Pick<LinearTelegramSettings, "operatorIds" | "operators">
    | null
    | undefined,
): ResolvedTelegramOperator[] {
  if (!telegram) return []
  if (telegram.operators && telegram.operators.length > 0) {
    return telegram.operators.map((o) => ({
      ...o,
      teamAccess: o.teamAccess === undefined ? "all" : o.teamAccess,
    }))
  }
  return (telegram.operatorIds ?? []).map((tgUserId) => ({
    tgUserId,
    tgUsername: null,
    tgDisplayName: null,
    memberUserId: null,
    canCreate: true,
    canListAll: true,
    canCancel: true,
    teamAccess: "all" as const,
  }))
}

/** Kullanıcının operatör kaydını döner (yetkili değilse null). */
export function findOperator(
  operators: LinearTelegramOperator[],
  userId: string | number,
): LinearTelegramOperator | null {
  const id = String(userId).trim()
  if (!id) return null
  return operators.find((o) => o.tgUserId === id) ?? null
}

/** Yalnız private chat kabul (grup/kanal reddedilir). */
export function isPrivateChat(chatType: string | undefined): boolean {
  return chatType === "private"
}

/** Telegram göndereninin insan-okur adı (triage buildRequester deseni). */
export function displayNameOf(from: TgUser): string {
  return (
    [from.first_name, from.last_name].filter(Boolean).join(" ").trim() ||
    from.username ||
    "Telegram User"
  )
}

// --- Runtime bot konfigürasyonu --------------------------------------------

/**
 * Poller/dispatcher'ın ihtiyaç duyduğu çözülmüş (decrypt'li) bot config'i.
 * Not: legacy `telegram.defaultTeamId` artık OKUNMAZ — takım seçimi operatör
 * bazlı `teamAccess` ile yönetilir (şemada yalnız geriye uyum için durur).
 */
export type TelegramBotConfig = {
  companyId: string
  botToken: string
  operators: LinearTelegramOperator[]
  /** Bot'un konuştuğu dil — her mesaj gönderiminde config'ten okunur. */
  language: BotLang
  updateOffset: number | null
}

/**
 * Dispatcher/flow'a geçen çalışma-zamanı bağlamı. `config` runner'ın her
 * 60sn taramasında yerinde güncellenir (mutable snapshot) — operatör listesi
 * değişiklikleri poller restart'ı gerektirmez.
 */
export type BotRuntime = {
  companyId: string
  api: TelegramApi
  config: TelegramBotConfig
}

/**
 * linear_settings.telegram subdoc'undan runtime config çözer. Token decrypt
 * edilemiyorsa (master key yok/cipher bozuk) null — bot o şirket için pasif.
 */
export function resolveBotConfig(
  companyId: string,
  telegram: LinearTelegramSettings | null | undefined,
): TelegramBotConfig | null {
  if (!telegram?.enabled) return null
  const botToken = safeDecrypt(telegram.botTokenCipher)
  if (!botToken) return null
  return {
    companyId,
    botToken,
    operators: resolveOperators(telegram),
    language: normalizeBotLang(telegram.language),
    updateOffset: telegram.updateOffset ?? null,
  }
}

/**
 * İşlenen update offset'ini + poll sağlık zamanını dot-path ile yazar.
 * Dot-path kullanmak zorunlu: `{ telegram: {...} }` $set'i settings PUT'un
 * yazdığı subdoc'u ezerdi. (Ters yönde küçük bir yarış kalır — PUT tüm
 * subdoc'u merge'leyerek yazar; offset gerilerse dedup koleksiyonu replay'i
 * no-op yapar, veri bütünlüğü bozulmaz.)
 */
export async function bumpTelegramOffset(
  companyId: string,
  updateId: number,
): Promise<void> {
  const db = await getDb()
  await db.collection("linear_settings").updateOne(
    { companyId },
    {
      $set: {
        "telegram.updateOffset": updateId,
        "telegram.lastPolledAt": new Date(),
      },
    },
  )
}

/** Yalnız sağlık zamanını işaretle (update gelmeyen boş poll turları için). */
export async function touchTelegramPolledAt(companyId: string): Promise<void> {
  const db = await getDb()
  await db
    .collection("linear_settings")
    .updateOne(
      { companyId },
      { $set: { "telegram.lastPolledAt": new Date() } },
    )
}

// --- Operatör keşfi (dinleme modu) ------------------------------------------

/**
 * Dinleme modu aktifken allowlist DIŞI özel mesaj gönderenin yalnız KİMLİĞİNİ
 * kaydeder (KVKK: mesaj içeriği yazılmaz). true = ilk kayıt (kibar bilgi
 * mesajı yalnız o zaman gönderilir — spam önlenir).
 */
export async function recordSeenUser(
  companyId: string,
  from: TgUser,
): Promise<boolean> {
  const db = await getDb()
  const res = await db.collection(SEEN).updateOne(
    { companyId, tgUserId: String(from.id) },
    {
      $set: {
        tgUsername: from.username ?? null,
        tgDisplayName: displayNameOf(from),
        lastSeenAt: new Date(),
      },
      $setOnInsert: { companyId, tgUserId: String(from.id) },
    },
    { upsert: true },
  )
  return res.upsertedCount > 0
}

export type SeenUser = {
  tgUserId: string
  tgUsername: string | null
  tgDisplayName: string | null
  lastSeenAt: Date
}

/** Keşif penceresinde görülen kullanıcılar — mevcut operatörler hariç. */
export async function listSeenUsers(
  companyId: string,
  operators: LinearTelegramOperator[],
): Promise<SeenUser[]> {
  const db = await getDb()
  const rows = await db
    .collection(SEEN)
    .find({ companyId })
    .sort({ lastSeenAt: -1 })
    .limit(50)
    .toArray()
  const operatorIds = new Set(operators.map((o) => o.tgUserId))
  return rows
    .filter((r) => !operatorIds.has(r.tgUserId as string))
    .map((r) => ({
      tgUserId: r.tgUserId as string,
      tgUsername: (r.tgUsername as string | null) ?? null,
      tgDisplayName: (r.tgDisplayName as string | null) ?? null,
      lastSeenAt: r.lastSeenAt as Date,
    }))
}

/**
 * Seen kayıtlarını temizler. companyId verilirse o şirketin TÜM kayıtları
 * (discovery bitişi); verilmezse yalnız süresi geçenler (15 dk — cleanup).
 */
export async function purgeSeenUsers(companyId?: string): Promise<number> {
  const db = await getDb()
  const filter = companyId
    ? { companyId }
    : { lastSeenAt: { $lt: new Date(Date.now() - SEEN_TTL_MS) } }
  const res = await db.collection(SEEN).deleteMany(filter)
  return res.deletedCount
}

/**
 * Şirketin GÜNCEL discovery penceresini DB'den okur (runner config'i 60sn
 * gecikmeli olduğundan, keşif anlık çalışsın diye yetkisiz-mesaj dalında
 * taze okunur — nadir yol, maliyeti düşük).
 */
export async function readDiscoveryActiveUntil(
  companyId: string,
): Promise<Date | null> {
  const db = await getDb()
  const doc = await db
    .collection("linear_settings")
    .findOne({ companyId }, { projection: { "telegram.discovery": 1 } })
  const until = (
    doc?.telegram as LinearTelegramSettings | undefined
  )?.discovery?.activeUntil
  return until ? new Date(until) : null
}

// --- Panel kullanıcı eşlemesi ------------------------------------------------

export type PanelUserLite = { id: string; email: string; name: string }

/**
 * better-auth `user` koleksiyonundan kullanıcıyı okur (memberUserId eşlemeli
 * /taleplerim için). Geçersiz id / bulunamadı → null.
 */
export async function getPanelUserById(
  userId: string,
): Promise<PanelUserLite | null> {
  try {
    const db = await getDb()
    const doc = await db
      .collection("user")
      .findOne(
        { _id: new ObjectId(userId) },
        { projection: { name: 1, email: 1 } },
      )
    if (!doc) return null
    return {
      id: userId,
      email: (doc.email as string | undefined) ?? "",
      name: (doc.name as string | undefined) ?? "",
    }
  } catch {
    return null
  }
}

// --- update_id dedup (triage telegram_processed_update portu) --------------

/**
 * Update'i işlenmiş olarak işaretler — ATOMİK (unique index). Zaten
 * işlenmişse false döner; dispatcher update'i atlar. Handler'dan ÖNCE
 * çağrılır (triage INSERT OR IGNORE deseni).
 */
export async function markUpdateProcessed(
  companyId: string,
  updateId: number,
): Promise<boolean> {
  const db = await getDb()
  try {
    await db.collection(UPDATES).insertOne({
      companyId,
      updateId,
      processedAt: new Date(),
    })
    return true
  } catch (err) {
    // 11000 = duplicate key → zaten işlenmiş.
    if ((err as { code?: number }).code === 11000) return false
    throw err
  }
}

// --- Index kurulumu (runner başlangıcında bir kez; idempotent) -------------

export async function ensureTelegramIndexes(): Promise<void> {
  const db = await getDb()
  await Promise.all([
    db
      .collection(SESSIONS)
      .createIndex({ companyId: 1, chatId: 1 }, { unique: true }),
    db
      .collection(REQUESTS)
      .createIndex({ companyId: 1, idempotencyKey: 1 }, { unique: true }),
    db.collection(REQUESTS).createIndex({ companyId: 1, tgUserId: 1 }),
    db.collection(REQUESTS).createIndex({ companyId: 1, issueId: 1 }),
    db
      .collection(UPDATES)
      .createIndex({ companyId: 1, updateId: 1 }, { unique: true }),
    db.collection(UPDATES).createIndex({ processedAt: 1 }),
    db
      .collection(SEEN)
      .createIndex({ companyId: 1, tgUserId: 1 }, { unique: true }),
    db.collection(SEEN).createIndex({ lastSeenAt: 1 }),
  ])
}
