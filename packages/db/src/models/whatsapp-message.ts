import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"

/**
 * WhatsApp Santral — kalıcı mesaj kaydı. `(companyId, sessionId)` ile
 * scope'lanır (çoklu numara). Idempotency `(companyId, sessionId, waMessageId)`
 * unique index ile. Bkz. [[whatsapp-session]].
 */

const COLLECTION = "whatsapp_messages"

export type WhatsappMessageType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "sticker"
  | "location"
  | "contact"
  | "other"

export type WhatsappMessageStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "read"
  | "failed"

export interface WhatsappReaction {
  emoji: string
  fromMe: boolean
  senderJid: string | null
}

export interface WhatsappLinkPreview {
  url: string
  title: string | null
  description: string | null
  /** jpegThumbnail data-URI (küçük) veya null. */
  image: string | null
}

export interface WhatsappMessage {
  id: string
  companyId: string
  sessionId: string
  chatJid: string
  waMessageId: string
  fromMe: boolean
  senderJid: string | null
  /** Gönderenin görünen adı (özellikle grup mesajlarında; WhatsApp pushName). */
  senderName: string | null
  type: WhatsappMessageType
  body: string
  status: WhatsappMessageStatus
  mediaId: string | null
  mimetype: string | null
  fileName: string | null
  /** Gömülü jpegThumbnail data-URI'si (tam medya talep üzerine indirilir). */
  thumbnail: string | null
  /** Link OG önizlemesi (extendedTextMessage'dan; sunucu fetch yok). */
  linkPreview: WhatsappLinkPreview | null
  /** Sesli mesaj dalga formu (0-100 amplitüd barları). */
  waveform: number[] | null
  /** Mesaja verilen emoji tepkileri. */
  reactions: WhatsappReaction[]
  timestamp: Date
  createdAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function append(data: {
  companyId: string
  sessionId: string
  chatJid: string
  waMessageId: string
  fromMe: boolean
  senderJid: string | null
  senderName?: string | null
  type: WhatsappMessageType
  body: string
  status?: WhatsappMessageStatus
  thumbnail?: string | null
  linkPreview?: WhatsappLinkPreview | null
  waveform?: number[] | null
  timestamp: Date
}): Promise<WhatsappMessage | null> {
  const c = await col()
  const now = new Date()
  const doc = {
    companyId: data.companyId,
    sessionId: data.sessionId,
    chatJid: data.chatJid,
    waMessageId: data.waMessageId,
    fromMe: data.fromMe,
    senderJid: data.senderJid,
    senderName: data.senderName ?? null,
    type: data.type,
    body: data.body,
    status: data.status ?? (data.fromMe ? "sent" : "delivered"),
    mediaId: null,
    mimetype: null,
    fileName: null,
    thumbnail: data.thumbnail ?? null,
    linkPreview: data.linkPreview ?? null,
    waveform: data.waveform ?? null,
    reactions: [] as WhatsappReaction[],
    timestamp: data.timestamp,
    createdAt: now,
  }
  const result = await c.findOneAndUpdate(
    {
      companyId: data.companyId,
      sessionId: data.sessionId,
      waMessageId: data.waMessageId,
    },
    { $setOnInsert: doc },
    { upsert: true, returnDocument: "before" },
  )
  if (result) return null // zaten vardı → duplicate
  const inserted = await c.findOne({
    companyId: data.companyId,
    sessionId: data.sessionId,
    waMessageId: data.waMessageId,
  })
  return toId(inserted)
}

export async function findByChat(
  companyId: string,
  sessionId: string,
  chatJid: string,
  opts?: { limit?: number; before?: Date },
): Promise<WhatsappMessage[]> {
  const c = await col()
  const filter: Record<string, unknown> = { companyId, sessionId, chatJid }
  if (opts?.before) filter.timestamp = { $lt: opts.before }
  const docs = await c
    .find(filter)
    .sort({ timestamp: -1 })
    .limit(Math.min(opts?.limit ?? 50, 200))
    .toArray()
  return docs.map(toId).reverse()
}

/**
 * Mesaj gövdesinde substring araması (case-insensitive), oturum kapsamlı.
 * Not: regex araması ölçek büyüdükçe index kullanamaz; ileride `body` üzerinde
 * text-index + ayrı substring stratejisi düşünülebilir (v1 için yeterli).
 */
export async function searchByBody(
  companyId: string,
  sessionId: string,
  query: string,
  limit = 40,
): Promise<WhatsappMessage[]> {
  const q = query.trim()
  if (!q) return []
  const c = await col()
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const docs = await c
    .find({
      companyId,
      sessionId,
      body: { $regex: escaped, $options: "i" },
    })
    .sort({ timestamp: -1 })
    .limit(Math.min(limit, 100))
    .toArray()
  return docs.map(toId)
}

export async function updateStatusByWaId(
  companyId: string,
  sessionId: string,
  waMessageId: string,
  status: WhatsappMessageStatus,
): Promise<void> {
  const c = await col()
  await c.updateOne({ companyId, sessionId, waMessageId }, { $set: { status } })
}

export async function setMedia(
  companyId: string,
  sessionId: string,
  waMessageId: string,
  media: { mediaId: string; mimetype: string | null; fileName: string | null },
): Promise<void> {
  const c = await col()
  await c.updateOne(
    { companyId, sessionId, waMessageId },
    {
      $set: {
        mediaId: media.mediaId,
        mimetype: media.mimetype,
        fileName: media.fileName,
      },
    },
  )
}

/**
 * Mesaja tepki uygula — aynı reactor'ın (fromMe+senderJid) önceki tepkisini
 * değiştirir; emoji boşsa tepkiyi kaldırır. Döner: güncel mesaj (broadcast için).
 */
export async function applyReaction(
  companyId: string,
  sessionId: string,
  waMessageId: string,
  reaction: { emoji: string; fromMe: boolean; senderJid: string | null },
): Promise<WhatsappMessage | null> {
  const c = await col()
  const msg = await c.findOne({ companyId, sessionId, waMessageId })
  if (!msg) return null
  const existing: WhatsappReaction[] = Array.isArray(msg.reactions)
    ? (msg.reactions as WhatsappReaction[])
    : []
  const filtered = existing.filter(
    (r) =>
      !(r.fromMe === reaction.fromMe && r.senderJid === reaction.senderJid),
  )
  const next = reaction.emoji
    ? [
        ...filtered,
        {
          emoji: reaction.emoji,
          fromMe: reaction.fromMe,
          senderJid: reaction.senderJid,
        },
      ]
    : filtered
  await c.updateOne(
    { companyId, sessionId, waMessageId },
    { $set: { reactions: next } },
  )
  return toId({ ...msg, reactions: next })
}

/**
 * Kişi detayı "Medya/Döküman/Link" sekmesi için sohbetin paylaşılan
 * öğeleri. media: image+video; docs: document; links: linkPreview'lı mesajlar.
 */
export async function findSharedByChat(
  companyId: string,
  sessionId: string,
  chatJid: string,
  kind: "media" | "docs" | "links",
  limit = 60,
): Promise<WhatsappMessage[]> {
  const c = await col()
  const filter: Record<string, unknown> = { companyId, sessionId, chatJid }
  if (kind === "media") {
    filter.type = { $in: ["image", "video"] }
    filter.mediaId = { $ne: null }
  } else if (kind === "docs") {
    filter.type = "document"
    filter.mediaId = { $ne: null }
  } else {
    filter.linkPreview = { $ne: null }
  }
  const docs = await c
    .find(filter)
    .sort({ timestamp: -1 })
    .limit(Math.min(limit, 200))
    .toArray()
  return docs.map(toId)
}

export async function findById(
  companyId: string,
  id: string,
): Promise<WhatsappMessage | null> {
  const c = await col()
  try {
    return toId(await c.findOne({ companyId, _id: toObjectId(id) }))
  } catch {
    return null
  }
}

export async function deleteByChat(
  companyId: string,
  sessionId: string,
  chatJid: string,
): Promise<void> {
  const c = await col()
  await c.deleteMany({ companyId, sessionId, chatJid })
}

export async function deleteByWaId(
  companyId: string,
  sessionId: string,
  waMessageId: string,
): Promise<boolean> {
  const c = await col()
  const r = await c.deleteOne({ companyId, sessionId, waMessageId })
  return r.deletedCount === 1
}

export async function deleteBySession(
  companyId: string,
  sessionId: string,
): Promise<void> {
  const c = await col()
  await c.deleteMany({ companyId, sessionId })
}

export async function deleteByCompany(companyId: string): Promise<void> {
  const c = await col()
  await c.deleteMany({ companyId })
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex(
    { companyId: 1, sessionId: 1, waMessageId: 1 },
    { unique: true },
  )
  await c.createIndex({ companyId: 1, sessionId: 1, chatJid: 1, timestamp: -1 })
}
