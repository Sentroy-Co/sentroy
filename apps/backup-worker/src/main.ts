import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http"
import { timingSafeEqual } from "node:crypto"
import { resolveConnection, updateJob, touchConnectionLastBackup } from "./db"
import { runDump, runRestore, isValidDbName } from "./mongo"
import { redactUris, assertPublicMongoHost } from "./uri"
import { getStream, headSize, deleteObject } from "./s3"

/**
 * Sentroy Backup Worker — mongodump/mongorestore çalıştıran bağımsız Node servisi
 * (Next.js DEĞİL). apps/downloader-worker desenini izler: node:http + tsx +
 * x-internal-secret. apps/backup (Next.js) buraya server-to-server konuşur;
 * tarayıcı asla doğrudan erişmez (Docker internal network, public domain YOK).
 *
 * İşler ASYNC: istek 202 ile hemen döner, iş arka planda çalışır ve job dökümanı
 * (mongo_backup_jobs) status/progress ile güncellenir. App job'u polling ile izler.
 */

const PORT = Number(process.env.PORT || "4400")
const bootAt = new Date()

// Eşzamanlı job tavanı — takılan/yavaş host'larla worker tükenmesin (DoS koruması).
const MAX_CONCURRENT = Number(process.env.BACKUP_MAX_CONCURRENT || "3")
let inFlight = 0

// Defense-in-depth: tek bir job'ın hatası asla paylaşımlı worker'ı çökertmesin.
// (Asıl fix mongo.ts'te — bu son savunma hattı; URI'ler redakte edilir.)
process.on("unhandledRejection", (e) => {
  const msg = e instanceof Error ? e.stack || e.message : String(e)
  console.error("[backup-worker] unhandledRejection:", redactUris(msg))
})
process.on("uncaughtException", (e) => {
  const msg = e instanceof Error ? e.stack || e.message : String(e)
  console.error("[backup-worker] uncaughtException:", redactUris(msg))
})

// ── Internal-secret auth (timing-safe) ──────────────────────────────────────
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}
function isAuthorized(req: IncomingMessage): boolean {
  const expected = process.env.BACKUP_API_SECRET
  if (!expected) return false
  const provided = req.headers["x-internal-secret"]
  if (typeof provided !== "string") return false
  return safeEqual(provided, expected)
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" })
  res.end(JSON.stringify(body))
}
async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > 1_000_000) return null
    chunks.push(chunk as Buffer)
  }
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"))
  } catch {
    return null
  }
}

function errMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  // Kredensiyal sızıntısını önle — job.error'a yazılmadan önce maskele.
  return redactUris(raw).slice(0, 2000)
}

// ── Job runners (async, fire-and-forget) ────────────────────────────────────
interface BackupPayload {
  jobId?: string
  companyId?: string
  connectionId?: string
  dbName?: string
  s3Key?: string
}
interface RestorePayload {
  jobId?: string
  companyId?: string
  connectionId?: string
  sourceDbName?: string
  targetDbName?: string
  s3Key?: string
  drop?: boolean
}

async function doBackup(p: {
  jobId: string
  companyId: string
  connectionId: string
  dbName: string
  s3Key: string
}) {
  const { jobId, companyId, connectionId, dbName, s3Key } = p
  try {
    const conn = await resolveConnection(connectionId, companyId)
    if (!conn) {
      await updateJob(jobId, {
        status: "failed",
        error: "Connection not found",
        finishedAt: new Date(),
      })
      return
    }
    // SSRF guard (defense-in-depth; DNS registration'dan sonra değişmiş olabilir).
    await assertPublicMongoHost(conn.uri)
    await updateJob(jobId, {
      status: "running",
      stage: "dumping",
      progress: 0,
      startedAt: new Date(),
    })
    let lastTick = 0
    const size = await runDump({
      uri: conn.uri,
      dbName,
      s3Key,
      onProgress: (loaded) => {
        const now = Date.now()
        if (now - lastTick < 2000) return
        lastTick = now
        // Toplam boyut bilinmez (stream) → byte + "uploading" aşaması.
        void updateJob(jobId, { stage: "uploading", sizeBytes: loaded })
      },
    })
    await updateJob(jobId, {
      status: "success",
      stage: "done",
      progress: 100,
      sizeBytes: size,
      finishedAt: new Date(),
    })
    await touchConnectionLastBackup(connectionId)
    console.log(`[backup-worker] backup ok job=${jobId} bytes=${size}`)
  } catch (e) {
    await updateJob(jobId, {
      status: "failed",
      error: errMessage(e),
      finishedAt: new Date(),
    }).catch(() => {})
    console.error(`[backup-worker] backup failed job=${jobId}: ${errMessage(e)}`)
  }
}

async function doRestore(p: {
  jobId: string
  companyId: string
  connectionId: string
  sourceDbName: string
  targetDbName: string
  s3Key: string
  drop: boolean
}) {
  const { jobId, companyId, connectionId, sourceDbName, targetDbName, s3Key, drop } = p
  try {
    const conn = await resolveConnection(connectionId, companyId)
    if (!conn) {
      await updateJob(jobId, {
        status: "failed",
        error: "Target connection not found",
        finishedAt: new Date(),
      })
      return
    }
    // SSRF guard (defense-in-depth).
    await assertPublicMongoHost(conn.uri)
    await updateJob(jobId, {
      status: "running",
      stage: "restoring",
      progress: 0,
      startedAt: new Date(),
    })
    await runRestore({ uri: conn.uri, s3Key, sourceDbName, targetDbName, drop })
    await updateJob(jobId, {
      status: "success",
      stage: "done",
      progress: 100,
      finishedAt: new Date(),
    })
    console.log(`[backup-worker] restore ok job=${jobId}`)
  } catch (e) {
    await updateJob(jobId, {
      status: "failed",
      error: errMessage(e),
      finishedAt: new Date(),
    }).catch(() => {})
    console.error(`[backup-worker] restore failed job=${jobId}: ${errMessage(e)}`)
  }
}

// ── Routes ──────────────────────────────────────────────────────────────
async function handle(req: IncomingMessage, res: ServerResponse) {
  const pathname = (req.url || "/").split("?")[0] || "/"
  const method = req.method || "GET"

  if (method === "GET" && pathname === "/health") {
    json(res, 200, {
      ok: true,
      service: "backup-worker",
      bootAt: bootAt.toISOString(),
    })
    return
  }

  if (!isAuthorized(req)) {
    json(res, 401, { error: "Unauthorized" })
    return
  }

  if (method === "POST" && pathname === "/backup") {
    const b = (await readBody(req)) as BackupPayload | null
    if (!b || !b.jobId || !b.companyId || !b.connectionId || !b.dbName || !b.s3Key) {
      json(res, 400, { error: "Missing required fields" })
      return
    }
    if (!isValidDbName(b.dbName)) {
      json(res, 400, { error: "Invalid database name" })
      return
    }
    if (inFlight >= MAX_CONCURRENT) {
      json(res, 429, { error: "Worker busy — try again shortly" })
      return
    }
    // Fire-and-forget — iş arka planda; job dökümanı ilerlemeyi taşır.
    inFlight++
    void doBackup({
      jobId: b.jobId,
      companyId: b.companyId,
      connectionId: b.connectionId,
      dbName: b.dbName,
      s3Key: b.s3Key,
    }).finally(() => {
      inFlight--
    })
    json(res, 202, { accepted: true })
    return
  }

  if (method === "POST" && pathname === "/restore") {
    const b = (await readBody(req)) as RestorePayload | null
    if (
      !b || !b.jobId || !b.companyId || !b.connectionId ||
      !b.sourceDbName || !b.targetDbName || !b.s3Key
    ) {
      json(res, 400, { error: "Missing required fields" })
      return
    }
    if (!isValidDbName(b.sourceDbName) || !isValidDbName(b.targetDbName)) {
      json(res, 400, { error: "Invalid database name" })
      return
    }
    if (inFlight >= MAX_CONCURRENT) {
      json(res, 429, { error: "Worker busy — try again shortly" })
      return
    }
    inFlight++
    void doRestore({
      jobId: b.jobId,
      companyId: b.companyId,
      connectionId: b.connectionId,
      sourceDbName: b.sourceDbName,
      targetDbName: b.targetDbName,
      s3Key: b.s3Key,
      drop: b.drop === true,
    }).finally(() => {
      inFlight--
    })
    json(res, 202, { accepted: true })
    return
  }

  // GET /file?key=<s3Key> → artefaktı stream'le (app download route'u proxy eder;
  // S3 kredensiyalleri YALNIZ worker'da). Company-scope app tarafında doğrulanır.
  if (method === "GET" && pathname === "/file") {
    const key = new URL(req.url || "/", "http://x").searchParams.get("key")
    if (!key) {
      json(res, 400, { error: "Missing key" })
      return
    }
    const size = await headSize(key)
    let stream
    try {
      stream = await getStream(key)
    } catch {
      json(res, 404, { error: "Artifact not found" })
      return
    }
    res.writeHead(200, {
      "Content-Type": "application/gzip",
      ...(size ? { "Content-Length": String(size) } : {}),
      "Cache-Control": "private, no-store",
    })
    stream.on("error", () => {
      if (!res.headersSent) json(res, 500, { error: "Stream failed" })
      else res.destroy()
    })
    stream.pipe(res)
    return
  }

  // DELETE /file?key=<s3Key> → artefaktı sil (job/bağlantı silinince app çağırır).
  if (method === "DELETE" && pathname === "/file") {
    const key = new URL(req.url || "/", "http://x").searchParams.get("key")
    if (!key) {
      json(res, 400, { error: "Missing key" })
      return
    }
    await deleteObject(key).catch(() => {})
    json(res, 200, { ok: true })
    return
  }

  json(res, 404, { error: "Not found" })
}

const server = createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error("[backup-worker] handler error:", err)
    if (!res.headersSent) json(res, 500, { error: "Internal error" })
  })
})

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[backup-worker] listening on ${PORT}`)
})

const shutdown = (signal: string) => {
  console.log(`[backup-worker] received ${signal}, shutting down…`)
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 10_000).unref()
}
process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT", () => shutdown("SIGINT"))
