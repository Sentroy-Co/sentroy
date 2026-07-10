import type { WAMessage } from "@whiskeysockets/baileys"
import type {
  WhatsappMessageType,
  WhatsappLinkPreview,
} from "@workspace/db/models/whatsapp-message"

/** `905xx@s.whatsapp.net` → `905xx`; grup/diğer JID → null. */
export function jidToPhone(jid: string | null | undefined): string | null {
  if (!jid) return null
  if (!jid.endsWith("@s.whatsapp.net")) return null
  const num = jid.split("@")[0]?.split(":")[0]
  return num || null
}

export function isGroupJid(jid: string | null | undefined): boolean {
  return !!jid && jid.endsWith("@g.us")
}

/** Baileys mesaj timestamp'ini (number | Long) Date'e çevirir. */
export function toDate(ts: WAMessage["messageTimestamp"]): Date {
  if (ts == null) return new Date()
  const n =
    typeof ts === "number"
      ? ts
      : typeof ts === "object" && "toNumber" in ts
        ? (ts as { toNumber: () => number }).toNumber()
        : Number(ts)
  return new Date(n * 1000)
}

/**
 * Baileys mesaj içeriğinden gösterilebilir tip + gövde çıkarır.
 * Protokol mesajları, reaction'lar, boş içerikler için `null` döner
 * (bunlar sohbet listesinde gösterilmez / saklanmaz).
 */
export function extractContent(
  msg: WAMessage,
): { type: WhatsappMessageType; body: string } | null {
  const m = msg.message
  if (!m) return null

  if (m.conversation) return { type: "text", body: m.conversation }
  if (m.extendedTextMessage?.text)
    return { type: "text", body: m.extendedTextMessage.text }
  if (m.imageMessage)
    return { type: "image", body: m.imageMessage.caption || "" }
  if (m.videoMessage)
    return { type: "video", body: m.videoMessage.caption || "" }
  if (m.audioMessage) return { type: "audio", body: "" }
  if (m.documentMessage)
    return {
      type: "document",
      body: m.documentMessage.fileName || m.documentMessage.caption || "",
    }
  if (m.documentWithCaptionMessage?.message?.documentMessage) {
    const d = m.documentWithCaptionMessage.message.documentMessage
    return { type: "document", body: d.fileName || d.caption || "" }
  }
  if (m.stickerMessage) return { type: "sticker", body: "" }
  if (m.locationMessage) {
    const loc = m.locationMessage
    return {
      type: "location",
      body:
        loc.name ||
        `${loc.degreesLatitude ?? ""},${loc.degreesLongitude ?? ""}`,
    }
  }
  if (m.contactMessage)
    return { type: "contact", body: m.contactMessage.displayName || "" }

  // reactionMessage, protocolMessage, senderKeyDistributionMessage, vb. → atla
  return null
}

/**
 * Medya mesajının deklare edilmiş meta'sı (indirmeden önce boyut kontrolü +
 * mimetype/dosya adı için). Medya değilse null.
 */
export function mediaMeta(
  msg: WAMessage,
): { mimetype: string | null; fileName: string | null; fileLength: number } | null {
  const m = msg.message
  if (!m) return null
  const doc = m.documentMessage || m.documentWithCaptionMessage?.message?.documentMessage
  const media =
    m.imageMessage ||
    m.videoMessage ||
    m.audioMessage ||
    doc ||
    m.stickerMessage
  if (!media) return null
  const fl = (media as { fileLength?: number | { toNumber?: () => number } })
    .fileLength
  const len =
    typeof fl === "number"
      ? fl
      : fl && typeof fl === "object" && "toNumber" in fl
        ? (fl.toNumber?.() ?? 0)
        : Number(fl ?? 0)
  return {
    mimetype:
      (media as { mimetype?: string }).mimetype ?? null,
    fileName: doc?.fileName ?? null,
    fileLength: len || 0,
  }
}

/** Link OG önizlemesi — extendedTextMessage'dan (WhatsApp gömer, sunucu fetch yok). */
export function extractLinkPreview(msg: WAMessage): WhatsappLinkPreview | null {
  const ext = msg.message?.extendedTextMessage
  if (!ext) return null
  const url = ext.canonicalUrl || ext.matchedText
  if (!url) return null
  let image: string | null = null
  const thumb = ext.jpegThumbnail
  if (thumb) {
    const buf = Buffer.isBuffer(thumb)
      ? thumb
      : Buffer.from(thumb as Uint8Array)
    if (buf.length > 0 && buf.length < 200_000) {
      image = `data:image/jpeg;base64,${buf.toString("base64")}`
    }
  }
  return {
    url,
    title: ext.title ?? null,
    description: ext.description ?? null,
    image,
  }
}

/** Gömülü jpegThumbnail → data-URI (image/video/document). Otomatik indirme
 *  yok; thumb ile UI önizleme, tam medya kullanıcı talebiyle indirilir. */
export function extractThumbnail(msg: WAMessage): string | null {
  const m = msg.message
  if (!m) return null
  const doc =
    m.documentMessage || m.documentWithCaptionMessage?.message?.documentMessage
  const media = m.imageMessage || m.videoMessage || doc
  const thumb = (
    media as { jpegThumbnail?: Uint8Array | null } | undefined
  )?.jpegThumbnail
  if (!thumb) return null
  const buf = Buffer.isBuffer(thumb) ? thumb : Buffer.from(thumb as Uint8Array)
  if (buf.length === 0 || buf.length > 200_000) return null
  return `data:image/jpeg;base64,${buf.toString("base64")}`
}

/** Sesli mesaj dalga formu — audioMessage.waveform byte dizisi (0-100). */
export function extractWaveform(msg: WAMessage): number[] | null {
  const wf = msg.message?.audioMessage?.waveform
  if (!wf) return null
  const arr = Array.from(wf as Uint8Array)
  return arr.length ? arr : null
}

/** Kısa önizleme metni (sohbet listesi son-mesaj satırı). */
export function previewText(
  type: WhatsappMessageType,
  body: string,
): string {
  if (body.trim()) return body.slice(0, 120)
  switch (type) {
    case "image":
      return "📷 Fotoğraf"
    case "video":
      return "🎬 Video"
    case "audio":
      return "🎤 Sesli mesaj"
    case "document":
      return "📄 Belge"
    case "sticker":
      return "🌟 Çıkartma"
    case "location":
      return "📍 Konum"
    case "contact":
      return "👤 Kişi"
    default:
      return "Mesaj"
  }
}
