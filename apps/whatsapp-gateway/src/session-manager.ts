import { createRequire } from "node:module"
import type {
  WASocket,
  WAMessage,
  AnyMessageContent,
} from "@whiskeysockets/baileys"
import QRCode from "qrcode"

// Baileys CJS → Node ESM interop: default import modül-objesini döndürür
// (fonksiyon değil) ve `proto` gibi named export'lar algılanmaz. Runtime
// değerleri createRequire ile gerçek module.exports'tan al (tipler korunur).
const nodeRequire = createRequire(import.meta.url)
const {
  default: makeWASocket,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  jidNormalizedUser,
} = nodeRequire("@whiskeysockets/baileys") as typeof import("@whiskeysockets/baileys")
import pino from "pino"
import {
  whatsappSessionModel,
  whatsappAuthKeyModel,
  whatsappContactModel,
  whatsappMessageModel,
} from "@workspace/db/models"
import type { WhatsappSessionStatus } from "@workspace/db/models/whatsapp-session"
import type { WhatsappMessageStatus } from "@workspace/db/models/whatsapp-message"
import { useMongoAuthState } from "./auth-state"
import { storeMedia } from "./media-store"
import {
  extractContent,
  extractLinkPreview,
  extractThumbnail,
  extractWaveform,
  isGroupJid,
  jidToPhone,
  mediaMeta,
  previewText,
  toDate,
} from "./message-utils"

const logger = pino({ level: process.env.WHATSAPP_LOG_LEVEL || "warn" })

const MAX_RECONNECT_ATTEMPTS = 5
const RECONNECT_DELAY_MS = 3_000
const MAX_MEDIA_BYTES = 25 * 1024 * 1024
const MEDIA_TYPES = new Set(["image", "video", "audio", "document", "sticker"])

/** Baileys numeric delivery status → status enum (SERVER_ACK=2…READ=4). */
function mapDeliveryStatus(s: number): WhatsappMessageStatus | null {
  if (s >= 4) return "read"
  if (s === 3) return "delivered"
  if (s === 2) return "sent"
  return null
}

type SseListener = (event: string, data: unknown) => void

interface Session {
  companyId: string
  sessionId: string
  socket: WASocket | null
  status: WhatsappSessionStatus
  phoneNumber: string | null
  pushName: string | null
  qr: string | null
  listeners: Set<SseListener>
  reconnectAttempts: number
  connecting: boolean
}

// Registry, `${companyId}:${sessionId}` ile anahtarlanır (çoklu numara).
const sessions = new Map<string, Session>()
const key = (companyId: string, sessionId: string) => `${companyId}:${sessionId}`

// Medya mesajlarının ham objesini on-demand indirme için tutar (otomatik
// indirme yok). Basit LRU; restart'ta boşalır → sohbet yeniden açılınca
// history resume cache'i tazeler. key = `${companyId}:${sessionId}:${waId}`.
const RAW_MEDIA_CACHE_MAX = 800
const rawMediaCache = new Map<string, WAMessage>()
function cacheRawMedia(
  companyId: string,
  sessionId: string,
  waId: string,
  msg: WAMessage,
): void {
  const k = `${companyId}:${sessionId}:${waId}`
  rawMediaCache.delete(k) // en sona taşı (LRU)
  rawMediaCache.set(k, msg)
  while (rawMediaCache.size > RAW_MEDIA_CACHE_MAX) {
    const oldest = rawMediaCache.keys().next().value
    if (oldest === undefined) break
    rawMediaCache.delete(oldest)
  }
}

function shell(companyId: string, sessionId: string): Session {
  const k = key(companyId, sessionId)
  let s = sessions.get(k)
  if (!s) {
    s = {
      companyId,
      sessionId,
      socket: null,
      status: "disconnected",
      phoneNumber: null,
      pushName: null,
      qr: null,
      listeners: new Set(),
      reconnectAttempts: 0,
      connecting: false,
    }
    sessions.set(k, s)
  }
  return s
}

function statusSnapshot(s: Session) {
  return {
    status: s.status,
    phoneNumber: s.phoneNumber,
    pushName: s.pushName,
    hasQr: !!s.qr,
  }
}

function broadcast(
  companyId: string,
  sessionId: string,
  event: string,
  data: unknown,
) {
  const s = sessions.get(key(companyId, sessionId))
  if (!s) return
  for (const listener of s.listeners) {
    try {
      listener(event, data)
    } catch {
      /* tek bozuk subscriber diğerlerini etkilemesin */
    }
  }
}

// ── SSE abonelik ────────────────────────────────────────────────────────────

export function subscribe(
  companyId: string,
  sessionId: string,
  listener: SseListener,
): () => void {
  const s = shell(companyId, sessionId)
  s.listeners.add(listener)
  listener("status", statusSnapshot(s))
  if (s.qr) listener("qr", { qr: s.qr })
  return () => {
    s.listeners.delete(listener)
  }
}

export function getStatus(companyId: string, sessionId: string) {
  const s = sessions.get(key(companyId, sessionId))
  if (!s)
    return {
      status: "disconnected" as WhatsappSessionStatus,
      phoneNumber: null,
      pushName: null,
      hasQr: false,
    }
  return statusSnapshot(s)
}

// ── Bağlantı yaşam döngüsü ────────────────────────────────────────────────

export async function connect(
  companyId: string,
  sessionId: string,
): Promise<void> {
  const s = shell(companyId, sessionId)
  if (s.connecting || s.status === "connected") return
  s.connecting = true

  try {
    const { state, saveCreds } = await useMongoAuthState(companyId, sessionId)
    const { version } = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger,
      printQRInTerminal: false,
      browser: ["Sentroy Santral", "Chrome", "1.0.0"],
      markOnlineOnConnect: false,
      // Geçmiş sohbetleri panele getir (santral kullanımında geçmiş şart).
      syncFullHistory: true,
    })
    s.socket = sock

    sock.ev.on("creds.update", saveCreds)

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update

      if (qr) {
        try {
          const dataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 })
          s.qr = dataUrl
          s.status = "qr"
          await whatsappSessionModel.upsertStatus(companyId, sessionId, {
            status: "qr",
            lastQrAt: new Date(),
          })
          broadcast(companyId, sessionId, "qr", { qr: dataUrl })
          broadcast(companyId, sessionId, "status", statusSnapshot(s))
        } catch (err) {
          logger.error({ err }, "qr encode failed")
        }
      }

      if (connection === "connecting") {
        s.status = "connecting"
        broadcast(companyId, sessionId, "status", statusSnapshot(s))
      } else if (connection === "open") {
        s.status = "connected"
        s.qr = null
        s.reconnectAttempts = 0
        const me = sock.user
        const normalized = me?.id ? jidNormalizedUser(me.id) : null
        s.phoneNumber = jidToPhone(normalized)
        s.pushName = me?.name ?? null
        await whatsappSessionModel.upsertStatus(companyId, sessionId, {
          status: "connected",
          phoneNumber: s.phoneNumber,
          pushName: s.pushName,
          lastConnectedAt: new Date(),
        })
        broadcast(companyId, sessionId, "status", statusSnapshot(s))
        logger.info(
          { companyId, sessionId, phone: s.phoneNumber },
          "whatsapp connected",
        )
      } else if (connection === "close") {
        s.socket = null
        const statusCode = (
          lastDisconnect?.error as
            | { output?: { statusCode?: number } }
            | undefined
        )?.output?.statusCode

        const loggedOut = statusCode === DisconnectReason.loggedOut
        const replaced = statusCode === DisconnectReason.connectionReplaced

        if (loggedOut || replaced) {
          if (loggedOut) {
            await whatsappAuthKeyModel.clearBySession(companyId, sessionId)
            await whatsappSessionModel.clearSession(companyId, sessionId)
          }
          s.status = "disconnected"
          s.qr = null
          s.phoneNumber = null
          s.pushName = null
          broadcast(companyId, sessionId, "status", statusSnapshot(s))
          logger.warn(
            { companyId, sessionId, statusCode },
            loggedOut ? "logged out" : "connection replaced",
          )
        } else if (s.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          s.reconnectAttempts++
          s.status = "connecting"
          broadcast(companyId, sessionId, "status", statusSnapshot(s))
          setTimeout(() => {
            s.connecting = false
            connect(companyId, sessionId).catch((err) =>
              logger.error({ err, companyId, sessionId }, "reconnect failed"),
            )
          }, RECONNECT_DELAY_MS)
          return
        } else {
          s.status = "disconnected"
          await whatsappSessionModel.upsertStatus(companyId, sessionId, {
            status: "disconnected",
          })
          broadcast(companyId, sessionId, "status", statusSnapshot(s))
          logger.error(
            { companyId, sessionId },
            "max reconnect attempts reached",
          )
        }
      }
    })

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify" && type !== "append") return
      for (const msg of messages) {
        try {
          await handleMessage(companyId, sessionId, msg, sock)
        } catch (err) {
          logger.error({ err, companyId, sessionId }, "message handling failed")
        }
      }
    })

    sock.ev.on("messages.update", async (updates) => {
      for (const u of updates) {
        const waId = u.key?.id
        const st = u.update?.status
        if (!waId || st == null) continue
        const mapped = mapDeliveryStatus(Number(st))
        if (!mapped) continue
        try {
          await whatsappMessageModel.updateStatusByWaId(
            companyId,
            sessionId,
            waId,
            mapped,
          )
          broadcast(companyId, sessionId, "status-update", {
            chatJid: u.key?.remoteJid ?? null,
            waMessageId: waId,
            status: mapped,
          })
        } catch (err) {
          logger.error({ err, companyId, sessionId }, "status update failed")
        }
      }
    })

    // Mesaj tepkileri (emoji) — gelen + giden (kendi tepkimiz echo'lanır).
    sock.ev.on("messages.reaction", async (reactions) => {
      for (const r of reactions) {
        const waId = r.key?.id
        if (!waId) continue
        const emoji = r.reaction?.text ?? ""
        const fromMe = !!r.reaction?.key?.fromMe
        const senderJid =
          r.reaction?.key?.participant ?? r.reaction?.key?.remoteJid ?? null
        try {
          const updated = await whatsappMessageModel.applyReaction(
            companyId,
            sessionId,
            waId,
            { emoji, fromMe, senderJid },
          )
          if (updated) {
            broadcast(companyId, sessionId, "reaction", {
              chatJid: updated.chatJid,
              waMessageId: waId,
              reactions: updated.reactions,
            })
          }
        } catch (err) {
          logger.error({ err, companyId, sessionId }, "reaction apply failed")
        }
      }
    })

    // Geçmiş senkronu — bağlanınca WhatsApp toplu chat/contact/message yollar
    // (chunk'lar halinde). Avatar fetch ETME (ban riski); yalnız mesaj+kişi.
    sock.ev.on("messaging-history.set", async ({ chats, contacts, messages }) => {
      try {
        // 1) Sohbetler — gerçek konuşmalar; grup subject'i / sohbet adı (chat.name).
        //    Bunlar liste öğesi olduğu için upsert (oluştur) uygundur.
        for (const chat of chats ?? []) {
          const jid = chat.id
          if (!jid || jid === "status@broadcast" || !chat.name) continue
          const group = isGroupJid(jid)
          await whatsappContactModel.upsertByJid(companyId, sessionId, jid, {
            name: chat.name,
            isGroup: group,
            phone: group ? null : jidToPhone(jid),
          })
        }
        // 2) Geçmiş mesajlar — sohbet öğelerini oluşturur/zenginleştirir.
        let appended = 0
        for (const msg of messages ?? []) {
          if (await handleHistoryMessage(companyId, sessionId, msg)) appended++
        }
        // 3) Kişiler (rehber) — adı/pushName'i upsert et (sıra-bağımsız: chunk
        //    sırası ne olursa olsun mesajla oluşan kayıtla birleşir). Konuşması
        //    olmayan isim-only kayıtlar listede gizli (findBySession lastMessageAt
        //    filtresi). İsim/pushName yoksa atla (boş kayıt yaratma).
        for (const ct of contacts ?? []) {
          const jid = ct.id
          if (!jid || jid === "status@broadcast") continue
          const name = ct.name ?? undefined
          const pushName = ct.notify ?? undefined
          if (!name && !pushName) continue
          const group = isGroupJid(jid)
          await whatsappContactModel.upsertByJid(companyId, sessionId, jid, {
            name,
            pushName,
            isGroup: group,
            phone: group ? null : jidToPhone(jid),
          })
        }
        broadcast(companyId, sessionId, "history", { appended })
        logger.info(
          {
            companyId,
            sessionId,
            contacts: contacts?.length ?? 0,
            messages: messages?.length ?? 0,
            appended,
          },
          "history sync batch",
        )
      } catch (err) {
        logger.error({ err, companyId, sessionId }, "history sync failed")
      }
    })

    // Rehber adı güncellemeleri — yalnız var olan sohbetlerin adını zenginleştir.
    const onContacts = async (
      cts: Array<{ id?: string | null; name?: string | null; notify?: string | null }>,
    ) => {
      for (const ct of cts) {
        if (!ct.id) continue
        const name = ct.name ?? undefined
        const notify = ct.notify ?? undefined
        if (!name && !notify) continue
        const updated = await whatsappContactModel
          .updateNames(companyId, sessionId, ct.id, { name, pushName: notify })
          .catch(() => false)
        if (updated && name) {
          broadcast(companyId, sessionId, "contact-update", { jid: ct.id, name })
        }
      }
    }
    sock.ev.on("contacts.upsert", onContacts)
    sock.ev.on("contacts.update", onContacts)
  } finally {
    s.connecting = false
  }
}

// ── Gelen/giden mesaj işleme + kalıcılık ─────────────────────────────────

async function handleMessage(
  companyId: string,
  sessionId: string,
  msg: WAMessage,
  sock: WASocket,
): Promise<void> {
  const remoteJid = msg.key.remoteJid
  if (!remoteJid || remoteJid === "status@broadcast") return
  const waId = msg.key.id
  if (!waId) return

  const content = extractContent(msg)
  if (!content) return

  const fromMe = !!msg.key.fromMe
  const isGroup = isGroupJid(remoteJid)
  const senderJid = isGroup
    ? (msg.key.participant ?? null)
    : fromMe
      ? null
      : remoteJid
  const ts = toDate(msg.messageTimestamp)

  const saved = await whatsappMessageModel.append({
    companyId,
    sessionId,
    chatJid: remoteJid,
    waMessageId: waId,
    fromMe,
    senderJid,
    senderName: fromMe ? null : (msg.pushName ?? null),
    type: content.type,
    body: content.body,
    thumbnail: extractThumbnail(msg),
    linkPreview: extractLinkPreview(msg),
    waveform: extractWaveform(msg),
    timestamp: ts,
  })
  if (!saved) return // duplicate teslim → broadcast etme

  const contact = await whatsappContactModel.upsertByJid(
    companyId,
    sessionId,
    remoteJid,
    {
      phone: isGroup ? null : jidToPhone(remoteJid),
      pushName: msg.pushName ?? undefined,
      isGroup,
      lastMessageAt: ts,
      lastMessagePreview: previewText(content.type, content.body),
      lastMessageFromMe: fromMe,
      incrementUnread: !fromMe,
    },
  )

  broadcast(companyId, sessionId, "message", { message: saved, contact })

  // Otomatik İNDİRMEZ — sadece on-demand indirme için ham mesajı cache'le
  // (thumbnail UI'da gösterilir, tam medya kullanıcı talebiyle iner).
  if (MEDIA_TYPES.has(content.type)) {
    cacheRawMedia(companyId, sessionId, waId, msg)
  }

  // Avatar'ı lazily çek (grup ikonu dahil) — kişi/grup için ilk kez.
  // Canlı mesaj hızıyla doğal throttle (bulk fetch yok → ban riski düşük).
  if (!contact.avatarFetchedAt) {
    void fetchAndStoreAvatar(companyId, sessionId, remoteJid, sock)
  }
  // Grup adını (subject) çek — adı henüz yoksa.
  if (isGroup && !contact.name) {
    void fetchAndStoreGroupName(companyId, sessionId, remoteJid, sock)
  }
}

async function fetchAndStoreGroupName(
  companyId: string,
  sessionId: string,
  jid: string,
  sock: WASocket,
): Promise<void> {
  try {
    const meta = await sock.groupMetadata(jid).catch(() => null)
    if (meta?.subject) {
      await whatsappContactModel.upsertByJid(companyId, sessionId, jid, {
        name: meta.subject,
        isGroup: true,
      })
      broadcast(companyId, sessionId, "contact-update", {
        jid,
        name: meta.subject,
      })
    }
  } catch (err) {
    logger.warn({ err, companyId, sessionId, jid }, "group name fetch failed")
  }
}

/** Geçmiş mesajı işler — medya indirmez, per-mesaj broadcast etmez. */
async function handleHistoryMessage(
  companyId: string,
  sessionId: string,
  msg: WAMessage,
): Promise<boolean> {
  const remoteJid = msg.key?.remoteJid
  if (!remoteJid || remoteJid === "status@broadcast") return false
  const waId = msg.key?.id
  if (!waId) return false
  const content = extractContent(msg)
  if (!content) return false

  const fromMe = !!msg.key.fromMe
  const isGroup = isGroupJid(remoteJid)
  const senderJid = isGroup
    ? (msg.key.participant ?? null)
    : fromMe
      ? null
      : remoteJid
  const ts = toDate(msg.messageTimestamp)

  const saved = await whatsappMessageModel.append({
    companyId,
    sessionId,
    chatJid: remoteJid,
    waMessageId: waId,
    fromMe,
    senderJid,
    senderName: fromMe ? null : (msg.pushName ?? null),
    type: content.type,
    body: content.body,
    thumbnail: extractThumbnail(msg),
    linkPreview: extractLinkPreview(msg),
    waveform: extractWaveform(msg),
    timestamp: ts,
  })
  if (MEDIA_TYPES.has(content.type)) {
    cacheRawMedia(companyId, sessionId, waId, msg)
  }
  await whatsappContactModel.upsertByJid(companyId, sessionId, remoteJid, {
    phone: isGroup ? null : jidToPhone(remoteJid),
    pushName: msg.pushName ?? undefined,
    isGroup,
  })
  await whatsappContactModel.setLastMessageIfNewer(companyId, sessionId, remoteJid, {
    at: ts,
    preview: previewText(content.type, content.body),
    fromMe,
  })
  return !!saved
}

async function fetchAndStoreAvatar(
  companyId: string,
  sessionId: string,
  jid: string,
  sock: WASocket,
): Promise<void> {
  try {
    const url = await sock
      .profilePictureUrl(jid, "image")
      .catch(() => undefined)
    // url null/undefined olsa bile setAvatar fetchedAt'i set eder → tekrar
    // denemez (foto'su olmayan kişiler için sonsuz fetch'i engeller).
    await whatsappContactModel.setAvatar(companyId, sessionId, jid, url ?? null)
    if (url) {
      broadcast(companyId, sessionId, "contact-update", { jid, avatarUrl: url })
    }
  } catch (err) {
    logger.warn({ err, companyId, sessionId, jid }, "avatar fetch failed")
  }
}

/** Sohbet açılınca on-demand avatar çekme (app endpoint'inden çağrılır). */
export async function fetchAvatar(
  companyId: string,
  sessionId: string,
  jid: string,
): Promise<{ avatarUrl: string | null }> {
  const s = sessions.get(key(companyId, sessionId))
  if (!s?.socket) return { avatarUrl: null }
  const url = await s.socket
    .profilePictureUrl(jid, "image")
    .catch(() => undefined)
  await whatsappContactModel.setAvatar(companyId, sessionId, jid, url ?? null)
  if (url) broadcast(companyId, sessionId, "contact-update", { jid, avatarUrl: url })
  return { avatarUrl: url ?? null }
}

async function downloadAndStoreMedia(
  companyId: string,
  sessionId: string,
  chatJid: string,
  waId: string,
  msg: WAMessage,
  sock: WASocket,
): Promise<{ mediaId: string; mimetype: string | null; fileName: string | null } | null> {
  const meta = mediaMeta(msg)
  if (!meta) throw new Error("Message has no downloadable media")
  if (meta.fileLength && meta.fileLength > MAX_MEDIA_BYTES) {
    throw new Error("Media exceeds size limit")
  }
  const buffer = (await downloadMediaMessage(
    msg,
    "buffer",
    {},
    { logger, reuploadRequest: sock.updateMediaMessage },
  )) as Buffer
  if (!buffer || buffer.length === 0) throw new Error("Empty media download")

  const mediaId = await storeMedia(companyId, sessionId, buffer, {
    mimetype: meta.mimetype,
    fileName: meta.fileName,
  })
  await whatsappMessageModel.setMedia(companyId, sessionId, waId, {
    mediaId,
    mimetype: meta.mimetype,
    fileName: meta.fileName,
  })
  broadcast(companyId, sessionId, "media-ready", {
    chatJid,
    waMessageId: waId,
    mediaId,
    mimetype: meta.mimetype,
    fileName: meta.fileName,
  })
  return { mediaId, mimetype: meta.mimetype, fileName: meta.fileName }
}

/**
 * Tam medyayı talep üzerine indirir (UI'da indir butonu). Ham mesaj cache'ten
 * okunur; restart sonrası cache'te yoksa sohbeti yeniden açmak (history resume)
 * gerekir.
 */
export async function fetchMediaOnDemand(
  companyId: string,
  sessionId: string,
  waId: string,
): Promise<{ mediaId: string; mimetype: string | null; fileName: string | null }> {
  const s = sessions.get(key(companyId, sessionId))
  if (!s?.socket || s.status !== "connected") {
    throw new Error("WhatsApp session is not connected")
  }
  const msg = rawMediaCache.get(`${companyId}:${sessionId}:${waId}`)
  if (!msg) {
    throw new Error("Media no longer available — reopen the chat to refetch")
  }
  const chatJid = msg.key?.remoteJid ?? ""
  const result = await downloadAndStoreMedia(
    companyId,
    sessionId,
    chatJid,
    waId,
    msg,
    s.socket,
  )
  if (!result) throw new Error("Media download failed")
  return result
}

// ── Mesaj gönderimi ─────────────────────────────────────────────────────────

function normalizeJid(to: string): string {
  if (to.includes("@")) return to
  const digits = to.replace(/\D/g, "")
  return `${digits}@s.whatsapp.net`
}

// Gönderim rate-limit (ban-riski azaltma) — session başına serialize + spacing.
const SEND_MIN_GAP_MS = Number(process.env.WHATSAPP_SEND_MIN_GAP_MS || "1200")
const SEND_JITTER_MS = Number(process.env.WHATSAPP_SEND_JITTER_MS || "800")
const sendChains = new Map<string, Promise<void>>()
const lastSentAt = new Map<string, number>()

async function acquireSendSlot(companyId: string, sessionId: string): Promise<void> {
  const k = key(companyId, sessionId)
  const prev = sendChains.get(k) ?? Promise.resolve()
  const slot = prev.then(async () => {
    const last = lastSentAt.get(k) ?? 0
    const elapsed = Date.now() - last
    const wait =
      Math.max(0, SEND_MIN_GAP_MS - elapsed) +
      Math.floor(Math.random() * SEND_JITTER_MS)
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastSentAt.set(k, Date.now())
  })
  sendChains.set(
    k,
    slot.catch(() => {}),
  )
  await slot
}

export async function sendText(
  companyId: string,
  sessionId: string,
  to: string,
  text: string,
): Promise<{ waMessageId: string | null }> {
  const s = sessions.get(key(companyId, sessionId))
  if (!s?.socket || s.status !== "connected") {
    throw new Error("WhatsApp session is not connected")
  }
  const jid = normalizeJid(to)
  await acquireSendSlot(companyId, sessionId)
  const sent = await s.socket.sendMessage(jid, { text })
  return { waMessageId: sent?.key?.id ?? null }
}

export type OutboundMediaKind = "image" | "video" | "audio" | "document"

export async function sendMedia(
  companyId: string,
  sessionId: string,
  to: string,
  opts: {
    kind: OutboundMediaKind
    buffer: Buffer
    mimetype: string
    fileName?: string
    caption?: string
  },
): Promise<{ waMessageId: string | null }> {
  const s = sessions.get(key(companyId, sessionId))
  if (!s?.socket || s.status !== "connected") {
    throw new Error("WhatsApp session is not connected")
  }
  const jid = normalizeJid(to)
  const { kind, buffer, mimetype, fileName, caption } = opts

  let content: AnyMessageContent
  if (kind === "image") {
    content = { image: buffer, caption, mimetype }
  } else if (kind === "video") {
    content = { video: buffer, caption, mimetype }
  } else if (kind === "audio") {
    content = { audio: buffer, mimetype: mimetype || "audio/mp4" }
  } else {
    content = {
      document: buffer,
      mimetype: mimetype || "application/octet-stream",
      fileName: fileName || "file",
      caption,
    }
  }

  await acquireSendSlot(companyId, sessionId)
  const sent = await s.socket.sendMessage(jid, content)
  return { waMessageId: sent?.key?.id ?? null }
}

/** Bir mesaja emoji tepki gönder (boş emoji → tepkiyi kaldır). */
export async function sendReaction(
  companyId: string,
  sessionId: string,
  opts: {
    chatJid: string
    waMessageId: string
    fromMe: boolean
    emoji: string
    senderJid?: string | null
  },
): Promise<void> {
  const s = sessions.get(key(companyId, sessionId))
  if (!s?.socket || s.status !== "connected") {
    throw new Error("WhatsApp session is not connected")
  }
  // Grup mesajlarına tepki için key.participant ZORUNLU — yoksa WhatsApp
  // reaksiyonu reddediyor (kullanıcıya "gitmiyor" gibi görünür).
  const isGroup = isGroupJid(opts.chatJid)
  const messageKey: {
    remoteJid: string
    id: string
    fromMe: boolean
    participant?: string
  } = {
    remoteJid: opts.chatJid,
    id: opts.waMessageId,
    fromMe: opts.fromMe,
  }
  if (isGroup && !opts.fromMe && opts.senderJid) {
    messageKey.participant = opts.senderJid
  }
  await s.socket.sendMessage(opts.chatJid, {
    react: { text: opts.emoji, key: messageKey },
  })
}

// ── Logout ─────────────────────────────────────────────────────────────────

export async function logout(
  companyId: string,
  sessionId: string,
): Promise<void> {
  const s = sessions.get(key(companyId, sessionId))
  if (s?.socket) {
    try {
      await s.socket.logout()
    } catch {
      /* socket zaten kapalı olabilir */
    }
    s.socket = null
  }
  await whatsappAuthKeyModel.clearBySession(companyId, sessionId)
  await whatsappSessionModel.clearSession(companyId, sessionId)
  if (s) {
    s.status = "disconnected"
    s.qr = null
    s.phoneNumber = null
    s.pushName = null
    s.reconnectAttempts = 0
    broadcast(companyId, sessionId, "status", statusSnapshot(s))
  }
}

// ── Boot-time resume ─────────────────────────────────────────────────────

export async function resumeAll(): Promise<number> {
  const resumable = await whatsappSessionModel.listResumable()
  let count = 0
  for (const session of resumable) {
    connect(session.companyId, session.sessionId).catch((err) =>
      logger.error(
        { err, companyId: session.companyId, sessionId: session.sessionId },
        "resume failed",
      ),
    )
    count++
  }
  return count
}

export function activeSessionCount(): number {
  let n = 0
  for (const s of sessions.values()) if (s.status === "connected") n++
  return n
}
