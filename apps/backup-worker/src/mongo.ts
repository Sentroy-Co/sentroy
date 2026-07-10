import { spawn } from "node:child_process"
import { uploadStream, getStream, deleteObject } from "./s3"

/**
 * mongodump/mongorestore motoru. STREAMED:
 *   backup  → `mongodump --archive --gzip` stdout → S3 multipart upload
 *   restore → S3 getObject stream → `mongorestore --archive --gzip` stdin
 *
 * GÜVENLİK: argv dizisiyle spawn (shell YOK → arg injection yok). URI parola
 * içerir → argv'de görünür ama container izole + non-public; LOG'a sanitize'siz
 * URI/argv ASLA yazılmaz. dbName argü injection'a karşı ayrıca doğrulanır.
 */

const DB_NAME_RE = /^[A-Za-z0-9_.\-]{1,120}$/

export function isValidDbName(name: string): boolean {
  return DB_NAME_RE.test(name)
}

// Tek bir job'ın azami süresi — takılan/yavaş bir Mongo host'u worker'ı süresiz
// meşgul edemesin (kaynak tükenmesi DoS koruması). Süre dolunca child SIGKILL'lenir.
const JOB_TIMEOUT_MS = Number(process.env.BACKUP_JOB_TIMEOUT_MS || String(60 * 60 * 1000))

/** stderr'in son ~8KB'ı — hata mesajı için (sanitize edilmeden loglanmaz). */
function tailCollector(limit = 8192) {
  let buf = ""
  return {
    push(chunk: Buffer) {
      buf += chunk.toString("utf8")
      if (buf.length > limit) buf = buf.slice(buf.length - limit)
    },
    get() {
      return buf.trim()
    },
  }
}

export interface DumpArgs {
  uri: string
  dbName: string
  s3Key: string
  onProgress?: (loadedBytes: number) => void
}

/** mongodump → S3. Yüklenen toplam byte döner. Hata olursa S3 objesi silinir. */
export async function runDump(args: DumpArgs): Promise<number> {
  if (!isValidDbName(args.dbName)) throw new Error("Invalid database name")

  const child = spawn(
    "mongodump",
    [`--uri=${args.uri}`, `--db=${args.dbName}`, "--archive", "--gzip"],
    { stdio: ["ignore", "pipe", "pipe"] },
  )
  const stderr = tailCollector()
  child.stderr.on("data", (d: Buffer) => stderr.push(d))
  // spawn hatası (binary yok) → stdout hiç 'end' etmez, Upload asılır; stream'i
  // yıkarak Upload'ı reddettir.
  child.on("error", (err) => child.stdout.destroy(err))

  // Süre aşımı: takılı child'ı öldür.
  const timer = setTimeout(() => {
    try {
      child.kill("SIGKILL")
    } catch {
      /* noop */
    }
  }, JOB_TIMEOUT_MS)
  timer.unref?.()

  const exit = new Promise<void>((resolve, reject) => {
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(stderr.get() || `mongodump exited ${code}`)),
    )
  })
  // ⚠ KRİTİK: exit uploadStream'den SONRA await'lenir; bu arada reddederse
  // "unhandled rejection" ile TÜM worker çöker (cross-tenant DoS). Handler'ı
  // senkron ekleyerek rejection'ı her zaman gözlemlenmiş yap.
  exit.catch(() => {})

  try {
    // Önce upload tamamlanır (stdout EOF + tüm part'lar), sonra exit-code doğrulanır.
    const size = await uploadStream(args.s3Key, child.stdout, args.onProgress)
    await exit
    return size
  } catch (err) {
    try {
      child.kill("SIGKILL")
    } catch {
      /* noop */
    }
    await deleteObject(args.s3Key).catch(() => {})
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export interface RestoreArgs {
  uri: string
  s3Key: string
  sourceDbName: string
  targetDbName: string
  drop: boolean
}

/** S3 artefakt → mongorestore. Kaynak db → hedef db ns-remap; drop opsiyonel. */
export async function runRestore(args: RestoreArgs): Promise<void> {
  if (!isValidDbName(args.sourceDbName) || !isValidDbName(args.targetDbName)) {
    throw new Error("Invalid database name")
  }
  const argv = [
    `--uri=${args.uri}`,
    "--archive",
    "--gzip",
    `--nsFrom=${args.sourceDbName}.*`,
    `--nsTo=${args.targetDbName}.*`,
  ]
  if (args.drop) argv.push("--drop")

  const source = await getStream(args.s3Key)
  const child = spawn("mongorestore", argv, {
    stdio: ["pipe", "ignore", "pipe"],
  })
  const stderr = tailCollector()
  child.stderr.on("data", (d: Buffer) => stderr.push(d))

  child.on("error", () => source.destroy())
  source.on("error", (err) => child.stdin.destroy(err))
  source.pipe(child.stdin)

  const timer = setTimeout(() => {
    try {
      child.kill("SIGKILL")
    } catch {
      /* noop */
    }
    source.destroy()
  }, JOB_TIMEOUT_MS)
  timer.unref?.()

  try {
    await new Promise<void>((resolve, reject) => {
      child.on("close", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(stderr.get() || `mongorestore exited ${code}`)),
      )
    })
  } finally {
    clearTimeout(timer)
  }
}
