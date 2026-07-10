import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { timingSafeEqual } from "node:crypto"
import {
  whatsappSessionModel,
  whatsappAuthKeyModel,
  whatsappContactModel,
  whatsappMessageModel,
  whatsappTemplateModel,
  whatsappAudienceModel,
  whatsappSendLogModel,
} from "@workspace/db/models"
import {
  connect,
  getStatus,
  logout,
  sendText,
  sendMedia,
  sendReaction,
  fetchAvatar,
  fetchMediaOnDemand,
  type OutboundMediaKind,
  subscribe,
  resumeAll,
  activeSessionCount,
} from "./session-manager"

/**
 * Sentroy WhatsApp Gateway — kalıcı Baileys socket'lerini tutan bağımsız
 * Node servisi (Next.js DEĞİL). apps/status-worker desenini izler.
 *
 * Next.js app'leri (`apps/whatsapp`) buraya `x-internal-secret` ile server-
 * to-server konuşur: oturum başlat/durum/logout/gönder + SSE event akışı.
 * Tarayıcı asla doğrudan bu servise bağlanmaz.
 */

const PORT = Number(process.env.PORT || "4200")
const bootAt = new Date()

// ── Internal-secret auth (timing-safe) ──────────────────────────────────────

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

function isAuthorized(req: IncomingMessage): boolean {
  const expected = process.env.INTERNAL_API_SECRET
  if (!expected) return false
  const provided = req.headers["x-internal-secret"]
  if (typeof provided !== "string") return false
  return safeEqual(provided, expected)
}

// ── Helpers ──────────────────────────────────────────────────────────────

function json(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body)
  res.writeHead(status, { "Content-Type": "application/json" })
  res.end(payload)
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"))
  } catch {
    return null
  }
}

// ── SSE ─────────────────────────────────────────────────────────────────

function startSse(
  companyId: string,
  sessionId: string,
  req: IncomingMessage,
  res: ServerResponse,
) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  })
  res.write(":ok\n\n")

  const unsubscribe = subscribe(companyId, sessionId, (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  })

  // Heartbeat — reverse-proxy idle timeout'unu önler.
  const heartbeat = setInterval(() => {
    res.write(`:hb ${Date.now()}\n\n`)
  }, 25_000)

  const cleanup = () => {
    clearInterval(heartbeat)
    unsubscribe()
  }
  req.on("close", cleanup)
  req.on("error", cleanup)
}

// ── Router ────────────────────────────────────────────────────────────────

// /sessions/:companyId/:sessionId[/:action]
const SESSION_RE =
  /^\/sessions\/([a-f0-9]{24})\/([a-f0-9]{6,64})(?:\/([a-z]+))?$/i

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`)
  const { pathname } = url
  const method = req.method || "GET"

  // Health — auth gerektirmez (Coolify liveness probe).
  if (pathname === "/health") {
    json(res, 200, {
      ok: true,
      bootAt,
      uptimeMs: Date.now() - bootAt.getTime(),
      activeSessions: activeSessionCount(),
    })
    return
  }

  if (!isAuthorized(req)) {
    json(res, 401, { error: "Unauthorized" })
    return
  }

  const match = SESSION_RE.exec(pathname)
  if (!match) {
    json(res, 404, { error: "Not found" })
    return
  }
  const companyId = match[1]!
  const sessionId = match[2]!
  const action = match[3]

  // GET /sessions/:companyId/:sessionId/status
  if (method === "GET" && action === "status") {
    json(res, 200, getStatus(companyId, sessionId))
    return
  }

  // GET /sessions/:companyId/:sessionId/events  (SSE)
  if (method === "GET" && action === "events") {
    startSse(companyId, sessionId, req, res)
    return
  }

  // POST /sessions/:companyId/:sessionId/connect
  if (method === "POST" && action === "connect") {
    connect(companyId, sessionId).catch((err) =>
      console.error(`[gateway] connect failed for ${companyId}/${sessionId}:`, err),
    )
    json(res, 202, { ok: true, ...getStatus(companyId, sessionId) })
    return
  }

  // POST /sessions/:companyId/:sessionId/send  { to, text }
  if (method === "POST" && action === "send") {
    const body = (await readBody(req)) as { to?: string; text?: string } | null
    if (!body || !body.to || !body.text) {
      json(res, 400, { error: "Missing 'to' or 'text'" })
      return
    }
    try {
      const result = await sendText(companyId, sessionId, body.to, body.text)
      json(res, 200, result)
    } catch (err) {
      json(res, 409, {
        error: err instanceof Error ? err.message : "Send failed",
      })
    }
    return
  }

  // POST /sessions/:companyId/:sessionId/sendmedia
  if (method === "POST" && action === "sendmedia") {
    const body = (await readBody(req)) as {
      to?: string
      kind?: OutboundMediaKind
      mimetype?: string
      fileName?: string
      caption?: string
      dataBase64?: string
    } | null
    if (!body || !body.to || !body.kind || !body.dataBase64) {
      json(res, 400, { error: "Missing 'to', 'kind' or 'dataBase64'" })
      return
    }
    const buffer = Buffer.from(body.dataBase64, "base64")
    if (buffer.length === 0 || buffer.length > 20 * 1024 * 1024) {
      json(res, 413, { error: "Media must be 1 byte–20MB" })
      return
    }
    try {
      const result = await sendMedia(companyId, sessionId, body.to, {
        kind: body.kind,
        buffer,
        mimetype: body.mimetype || "application/octet-stream",
        fileName: body.fileName,
        caption: body.caption,
      })
      json(res, 200, result)
    } catch (err) {
      json(res, 409, {
        error: err instanceof Error ? err.message : "Send failed",
      })
    }
    return
  }

  // POST /sessions/:companyId/:sessionId/react  { chatJid, waMessageId, fromMe, emoji }
  if (method === "POST" && action === "react") {
    const body = (await readBody(req)) as {
      chatJid?: string
      waMessageId?: string
      fromMe?: boolean
      emoji?: string
      senderJid?: string | null
    } | null
    if (!body || !body.chatJid || !body.waMessageId) {
      json(res, 400, { error: "Missing 'chatJid' or 'waMessageId'" })
      return
    }
    try {
      await sendReaction(companyId, sessionId, {
        chatJid: body.chatJid,
        waMessageId: body.waMessageId,
        fromMe: !!body.fromMe,
        emoji: body.emoji ?? "",
        senderJid: body.senderJid ?? null,
      })
      json(res, 200, { ok: true })
    } catch (err) {
      json(res, 409, {
        error: err instanceof Error ? err.message : "React failed",
      })
    }
    return
  }

  // POST /sessions/:companyId/:sessionId/fetchmedia  { waMessageId }
  // Tam medyayı talep üzerine indir (otomatik indirme yok).
  if (method === "POST" && action === "fetchmedia") {
    const body = (await readBody(req)) as { waMessageId?: string } | null
    if (!body || !body.waMessageId) {
      json(res, 400, { error: "Missing 'waMessageId'" })
      return
    }
    try {
      const result = await fetchMediaOnDemand(
        companyId,
        sessionId,
        body.waMessageId,
      )
      json(res, 200, result)
    } catch (err) {
      json(res, 409, {
        error: err instanceof Error ? err.message : "Media fetch failed",
      })
    }
    return
  }

  // POST /sessions/:companyId/:sessionId/avatar  { jid }  (on-demand profil foto)
  if (method === "POST" && action === "avatar") {
    const body = (await readBody(req)) as { jid?: string } | null
    if (!body || !body.jid) {
      json(res, 400, { error: "Missing 'jid'" })
      return
    }
    try {
      const result = await fetchAvatar(companyId, sessionId, body.jid)
      json(res, 200, result)
    } catch {
      json(res, 200, { avatarUrl: null })
    }
    return
  }

  // DELETE /sessions/:companyId/:sessionId  (logout)
  if (method === "DELETE" && !action) {
    await logout(companyId, sessionId)
    json(res, 200, { ok: true })
    return
  }

  json(res, 405, { error: "Method not allowed" })
}

const server = createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error("[gateway] unhandled:", err)
    if (!res.headersSent) json(res, 500, { error: "Internal error" })
  })
})

// ── Bootstrap ────────────────────────────────────────────────────────────

async function main() {
  console.log("[gateway] Sentroy WhatsApp Gateway starting…")

  // Index'leri garanti et (idempotent).
  await Promise.all([
    whatsappSessionModel.createIndexes(),
    whatsappAuthKeyModel.createIndexes(),
    whatsappContactModel.createIndexes(),
    whatsappMessageModel.createIndexes(),
    whatsappTemplateModel.createIndexes(),
    whatsappAudienceModel.createIndexes(),
    whatsappSendLogModel.createIndexes(),
  ]).catch((err) => console.error("[gateway] index creation failed:", err))

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[gateway] listening on ${PORT}`)
  })

  // Önceki oturumları sessizce yeniden bağla.
  try {
    const resumed = await resumeAll()
    console.log(`[gateway] resuming ${resumed} session(s)`)
  } catch (err) {
    console.error("[gateway] resume failed:", err)
  }

  const shutdown = (signal: string) => {
    console.log(`[gateway] received ${signal}, shutting down…`)
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(1), 10_000).unref()
  }
  process.on("SIGTERM", () => shutdown("SIGTERM"))
  process.on("SIGINT", () => shutdown("SIGINT"))
}

main().catch((err) => {
  console.error("[gateway] fatal:", err)
  process.exit(1)
})
