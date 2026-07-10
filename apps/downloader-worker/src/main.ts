import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http"
import { timingSafeEqual, randomUUID } from "node:crypto"
import { createReadStream, createWriteStream, writeFileSync } from "node:fs"
import { unlink, readdir, stat, mkdir } from "node:fs/promises"
import path from "node:path"
import { convertOffice, isAllowedTarget, inputExtFromName } from "./office"
import {
  fetchInfo,
  download,
  downloadStreaming,
  validateUrl,
  isPlatformEnabled,
  sanitizeFilename,
  type Platform,
} from "./ytdlp"
import { fetchInstagramInfo, downloadInstagramMedia } from "./instagram"

/**
 * Sentroy Downloader Worker — yt-dlp/ffmpeg'i çalıştıran bağımsız Node servisi
 * (Next.js DEĞİL). apps/whatsapp-gateway desenini izler: node:http + tsx +
 * x-internal-secret. apps/downloader (Next.js) buraya server-to-server konuşur;
 * tarayıcı asla doğrudan erişmez (Docker internal network, public domain yok).
 */

const PORT = Number(process.env.PORT || "4300")
const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || "/tmp/dl"

// Cookie'yi Coolify env (base64) ile geçirme — file-mount gerektirmez.
// yt-dlp bot-korumasını (youtube/google oturum çerezleri) aşmak için.
if (process.env.YTDLP_COOKIES_B64 && !process.env.YTDLP_COOKIES_FILE) {
  try {
    const p = "/tmp/yt-cookies.txt"
    writeFileSync(p, Buffer.from(process.env.YTDLP_COOKIES_B64, "base64"))
    process.env.YTDLP_COOKIES_FILE = p
    console.log("[downloader-worker] cookies yüklendi (YTDLP_COOKIES_B64)")
  } catch (err) {
    console.error("[downloader-worker] cookie decode hatası:", err)
  }
}
// Instagram için AYRI cookie (opsiyonel — proxy-first). gallery-dl + yt-dlp
// instagram'da bunu kullanır (ytdlp.cookieFileFor / gallerydl).
if (process.env.INSTAGRAM_COOKIES_B64 && !process.env.INSTAGRAM_COOKIES_FILE) {
  try {
    const p = "/tmp/ig-cookies.txt"
    writeFileSync(p, Buffer.from(process.env.INSTAGRAM_COOKIES_B64, "base64"))
    process.env.INSTAGRAM_COOKIES_FILE = p
    console.log("[downloader-worker] instagram cookies yüklendi (INSTAGRAM_COOKIES_B64)")
  } catch (err) {
    console.error("[downloader-worker] instagram cookie decode hatası:", err)
  }
}
const FILE_TTL_MS = Number(process.env.FILE_TTL_MS || String(60 * 60 * 1000)) // 1 saat
const bootAt = new Date()

// ── Geçici dosya kayıt defteri (token → dosya) ──────────────────────────────
interface StoredFile {
  filePath: string
  downloadName: string
  mime: string
  sizeBytes: number
  expiresAt: number
}
const files = new Map<string, StoredFile>()

// ── Internal-secret auth (timing-safe) ──────────────────────────────────────
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}
function isAuthorized(req: IncomingMessage): boolean {
  const expected = process.env.DOWNLOADER_API_SECRET
  if (!expected) return false
  const provided = req.headers["x-internal-secret"]
  if (typeof provided !== "string") return false
  return safeEqual(provided, expected)
}

// ── Helpers ──────────────────────────────────────────────────────────────
function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" })
  res.end(JSON.stringify(body))
}
async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > 1_000_000) return null // 1MB JSON guard
    chunks.push(chunk as Buffer)
  }
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"))
  } catch {
    return null
  }
}

// Raw request body'yi dosyaya yaz (yükleme; JSON guard'dan ayrı, büyük cap).
const OFFICE_MAX_BYTES = Number(process.env.OFFICE_MAX_BYTES || String(50 * 1024 * 1024)) // 50MB
async function readBodyToFile(req: IncomingMessage, destPath: string, maxBytes: number): Promise<number> {
  await mkdir(path.dirname(destPath), { recursive: true })
  const out = createWriteStream(destPath)
  let size = 0
  try {
    for await (const chunk of req) {
      size += (chunk as Buffer).length
      if (size > maxBytes) {
        out.destroy()
        await unlink(destPath).catch(() => {})
        throw new Error("too_large")
      }
      if (!out.write(chunk)) await new Promise((r) => out.once("drain", r))
    }
    await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())))
    return size
  } catch (e) {
    out.destroy()
    throw e
  }
}

// ── Routes ──────────────────────────────────────────────────────────────
const FILE_RE = /^\/file\/([0-9a-f-]{36})$/i

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = req.url || "/"
  const method = req.method || "GET"
  const pathname = url.split("?")[0] || "/"

  // Health — auth yok (Coolify liveness probe)
  if (method === "GET" && pathname === "/health") {
    json(res, 200, {
      ok: true,
      service: "downloader-worker",
      bootAt: bootAt.toISOString(),
      cached: files.size,
    })
    return
  }

  if (!isAuthorized(req)) {
    json(res, 401, { error: "Unauthorized" })
    return
  }

  // POST /info  { url, platform }
  if (method === "POST" && pathname === "/info") {
    const body = (await readBody(req)) as {
      url?: string
      platform?: string
    } | null
    if (!body || !body.url || !body.platform) {
      json(res, 400, { error: "Missing 'url' or 'platform'" })
      return
    }
    if (!isPlatformEnabled(body.platform)) {
      json(res, 400, { error: "Platform not supported yet" })
      return
    }
    if (!validateUrl(body.url, body.platform as Platform)) {
      json(res, 400, { error: "Invalid or unsupported link" })
      return
    }
    try {
      const info =
        body.platform === "instagram"
          ? await fetchInstagramInfo(body.url.trim())
          : await fetchInfo(body.url.trim(), body.platform as Platform)
      json(res, 200, info)
    } catch (err) {
      json(res, 422, {
        error: err instanceof Error ? err.message : "Failed to fetch info",
      })
    }
    return
  }

  // POST /download  { url, platform, kind, quality, title? }
  if (method === "POST" && pathname === "/download") {
    const body = (await readBody(req)) as {
      url?: string
      platform?: string
      kind?: string
      quality?: string
      title?: string
    } | null
    // quality yalnız video/audio için gerekli (download() doğrular);
    // image/carousel/profile'da anlamsız.
    if (!body || !body.url || !body.platform || !body.kind) {
      json(res, 400, { error: "Missing required fields" })
      return
    }
    if (!isPlatformEnabled(body.platform)) {
      json(res, 400, { error: "Platform not supported yet" })
      return
    }
    if (!validateUrl(body.url, body.platform as Platform)) {
      json(res, 400, { error: "Invalid or unsupported link" })
      return
    }
    const KINDS = ["video", "audio", "thumbnail", "image", "carousel", "profile"] as const
    if (!(KINDS as readonly string[]).includes(body.kind)) {
      json(res, 400, { error: "Invalid kind" })
      return
    }
    const isMedia = body.kind === "image" || body.kind === "carousel" || body.kind === "profile"
    if (isMedia && body.platform !== "instagram") {
      json(res, 400, { error: "Invalid kind for platform" })
      return
    }
    try {
      const result = isMedia
        ? await downloadInstagramMedia(
            body.kind as "image" | "carousel" | "profile",
            body.url.trim(),
          )
        : await download(
            body.url.trim(),
            body.kind as "video" | "audio" | "thumbnail",
            body.quality ?? "",
            body.platform as Platform,
          )
      const token = randomUUID()
      const downloadName = `${sanitizeFilename(body.title || "download")}.${result.ext}`
      files.set(token, {
        filePath: result.filePath,
        downloadName,
        mime: result.mime,
        sizeBytes: result.sizeBytes,
        expiresAt: Date.now() + FILE_TTL_MS,
      })
      json(res, 200, {
        token,
        filename: downloadName,
        size: result.sizeBytes,
        ext: result.ext,
        mime: result.mime,
        expiresAt: new Date(Date.now() + FILE_TTL_MS).toISOString(),
      })
    } catch (err) {
      json(res, 422, {
        error: err instanceof Error ? err.message : "Download failed",
      })
    }
    return
  }

  // POST /download-stream { url, platform, kind, quality, title? } → SSE
  // (yalnız yt-dlp kind'leri: video/audio/thumbnail). Progress + done/error.
  if (method === "POST" && pathname === "/download-stream") {
    const body = (await readBody(req)) as {
      url?: string
      platform?: string
      kind?: string
      quality?: string
      title?: string
    } | null
    if (!body || !body.url || !body.platform || !body.kind) {
      json(res, 400, { error: "Missing required fields" })
      return
    }
    if (!isPlatformEnabled(body.platform)) {
      json(res, 400, { error: "Platform not supported yet" })
      return
    }
    if (!validateUrl(body.url, body.platform as Platform)) {
      json(res, 400, { error: "Invalid or unsupported link" })
      return
    }
    if (body.kind !== "video" && body.kind !== "audio" && body.kind !== "thumbnail") {
      json(res, 400, { error: "Invalid kind for stream" })
      return
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    })
    const send = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`)
    send({ type: "progress", stage: "downloading", percent: 0 })
    try {
      const result = await downloadStreaming(
        body.url.trim(),
        body.kind,
        body.quality ?? "",
        body.platform as Platform,
        (p) => send({ type: "progress", ...p }),
      )
      const token = randomUUID()
      const downloadName = `${sanitizeFilename(body.title || "download")}.${result.ext}`
      files.set(token, {
        filePath: result.filePath,
        downloadName,
        mime: result.mime,
        sizeBytes: result.sizeBytes,
        expiresAt: Date.now() + FILE_TTL_MS,
      })
      send({
        type: "done",
        token,
        filename: downloadName,
        size: result.sizeBytes,
        ext: result.ext,
        mime: result.mime,
        expiresAt: new Date(Date.now() + FILE_TTL_MS).toISOString(),
      })
    } catch (err) {
      send({ type: "error", error: err instanceof Error ? err.message : "Download failed" })
    }
    res.end()
    return
  }

  // POST /office/convert?to=<fmt>&name=<origName>  (raw file body)
  // LibreOffice ile Office/ODF ↔ PDF. App proxy eder; tarayıcı doğrudan erişmez.
  if (method === "POST" && pathname === "/office/convert") {
    const q = new URL(url, "http://x").searchParams
    const to = (q.get("to") || "").toLowerCase()
    const name = q.get("name") || "document"
    if (!isAllowedTarget(to)) {
      json(res, 400, { error: "Unsupported target format" })
      return
    }
    const inputExt = inputExtFromName(name)
    if (!inputExt) {
      json(res, 400, { error: "Unsupported or missing input file type" })
      return
    }
    const inputPath = path.join(DOWNLOAD_DIR, `office-in-${randomUUID()}.${inputExt}`)
    try {
      await readBodyToFile(req, inputPath, OFFICE_MAX_BYTES)
    } catch (e) {
      json(res, e instanceof Error && e.message === "too_large" ? 413 : 400, { error: "Upload failed" })
      return
    }
    try {
      const result = await convertOffice(inputPath, inputExt, to, DOWNLOAD_DIR)
      const token = randomUUID()
      const base = sanitizeFilename(name.replace(/\.[^.]+$/, "")) || "document"
      const downloadName = `${base}.${result.ext}`
      files.set(token, {
        filePath: result.filePath,
        downloadName,
        mime: result.mime,
        sizeBytes: result.sizeBytes,
        expiresAt: Date.now() + FILE_TTL_MS,
      })
      json(res, 200, {
        token,
        filename: downloadName,
        size: result.sizeBytes,
        ext: result.ext,
        mime: result.mime,
        expiresAt: new Date(Date.now() + FILE_TTL_MS).toISOString(),
      })
    } catch (err) {
      json(res, 422, { error: err instanceof Error ? err.message : "Conversion failed" })
    } finally {
      await unlink(inputPath).catch(() => {})
    }
    return
  }

  // GET /file/:token  → stream (app proxy eder)
  const fileMatch = pathname.match(FILE_RE)
  if (method === "GET" && fileMatch) {
    const token = fileMatch[1]!
    const entry = files.get(token)
    if (!entry || entry.expiresAt < Date.now()) {
      json(res, 404, { error: "File expired or not found" })
      return
    }
    const asciiName = entry.downloadName.replace(/[^\x20-\x7e]/g, "_")
    res.writeHead(200, {
      "Content-Type": entry.mime,
      "Content-Length": String(entry.sizeBytes),
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(entry.downloadName)}`,
      "Cache-Control": "private, no-store",
    })
    const stream = createReadStream(entry.filePath)
    stream.on("error", () => {
      if (!res.headersSent) json(res, 500, { error: "Stream failed" })
      else res.destroy()
    })
    stream.pipe(res)
    return
  }

  json(res, 404, { error: "Not found" })
}

const server = createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error("[downloader-worker] handler error:", err)
    if (!res.headersSent) json(res, 500, { error: "Internal error" })
  })
})

// ── Cleanup — süresi dolan dosyaları sil (1 saat TTL) ───────────────────────
async function cleanup() {
  const now = Date.now()
  // 1) Kayıtlı (token'lı) süresi dolmuş dosyalar
  for (const [token, entry] of files) {
    if (entry.expiresAt < now) {
      files.delete(token)
      await unlink(entry.filePath).catch(() => {})
    }
  }
  // 2) Orphan dosyalar (kayıtta olmayan, mtime > TTL) — restart/crash sonrası
  try {
    const known = new Set([...files.values()].map((f) => path.basename(f.filePath)))
    for (const name of await readdir(DOWNLOAD_DIR)) {
      if (known.has(name)) continue
      const p = path.join(DOWNLOAD_DIR, name)
      const st = await stat(p).catch(() => null)
      if (st && now - st.mtimeMs > FILE_TTL_MS) {
        await unlink(p).catch(() => {})
      }
    }
  } catch {
    /* dizin yoksa yok say */
  }
}
const cleanupTimer = setInterval(() => {
  cleanup().catch((err) => console.error("[downloader-worker] cleanup:", err))
}, 5 * 60 * 1000)
cleanupTimer.unref?.()

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[downloader-worker] listening on ${PORT}`)
})

const shutdown = (signal: string) => {
  console.log(`[downloader-worker] received ${signal}, shutting down…`)
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 10_000).unref()
}
process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT", () => shutdown("SIGINT"))
