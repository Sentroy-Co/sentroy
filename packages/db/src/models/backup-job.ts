import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "backup_jobs"

/**
 * Database backup job kaydı — admin'in trigger ettiği source→target Mongo
 * kopyalama işleminin meta'sı. Asıl veri target Mongo'ya yazılır; bu kayıt
 * "ne zaman, nereye, ne kadar başarılı" bilgisini tutar (history + retry +
 * restore için).
 *
 * Sensitive: targetUri credentials içerebilir. UI'a döndürürken sanitize
 * edilir (host'u göster, kullanıcı/parolayı maskele). DB'de plain text
 * tutulur — admin-only erişim, ek encryption layer ileride.
 */
export type BackupJobStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"

export type BackupJobKind = "backup" | "restore" | "import"

/** Job'ın etiketi: "snapshot" import öncesi otomatik alınan güvenlik
 *  yedeği, "manual" admin'in elle tetiklediği — UI badge'i için. */
export type BackupJobTag = "snapshot" | "manual" | null

export interface BackupJob {
  id: string
  /** "backup" = source(=current MONGODB_URI) → targetUri yeni db; "restore"
   *  = targetUri'deki backup db → current overwrite; "import" = JSON yükleme,
   *  current db'ye yazılır (target=current). */
  kind: BackupJobKind
  /** Optional etiket: snapshot (auto-pre-import), manual, vb. */
  tag?: BackupJobTag
  /** Job'ı tetikleyen admin user id. */
  triggeredBy: string
  /** Source connection (current cluster ya da backup target). */
  sourceUri: string
  sourceDbName: string
  /** Target connection (backup destination ya da restore source). */
  targetUri: string
  /** Yazılan DB adı — backup için `sentroy-backup-{YYYYMMDD-HHMMSS}`,
   *  restore için target current db adı. */
  targetDbName: string
  status: BackupJobStatus
  /** Bilgi: kaç collection işlendi. */
  collectionsCopied: number
  /** Bilgi: toplam doküman sayısı. */
  totalDocs: number
  /** Hata mesajı, fail durumunda. */
  error?: string | null
  startedAt: Date
  finishedAt?: Date | null
  createdAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function insert(data: {
  kind: BackupJobKind
  triggeredBy: string
  sourceUri: string
  sourceDbName: string
  targetUri: string
  targetDbName: string
  tag?: BackupJobTag
}): Promise<BackupJob> {
  const c = await col()
  const now = new Date()
  const doc = {
    ...data,
    tag: data.tag ?? null,
    status: "pending" as BackupJobStatus,
    collectionsCopied: 0,
    totalDocs: 0,
    error: null,
    startedAt: now,
    finishedAt: null,
    createdAt: now,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

export async function updateStatus(
  id: string,
  patch: {
    status?: BackupJobStatus
    collectionsCopied?: number
    totalDocs?: number
    error?: string | null
    finishedAt?: Date | null
  },
): Promise<BackupJob | null> {
  const c = await col()
  const updated = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    { $set: patch },
    { returnDocument: "after" },
  )
  return toId(updated) as BackupJob | null
}

export async function findById(id: string): Promise<BackupJob | null> {
  const c = await col()
  const doc = await c.findOne({ _id: toObjectId(id) })
  return toId(doc) as BackupJob | null
}

export async function list(opts?: {
  limit?: number
  kind?: BackupJobKind
}): Promise<BackupJob[]> {
  const c = await col()
  const filter: Record<string, unknown> = {}
  if (opts?.kind) filter.kind = opts.kind
  const docs = await c
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(opts?.limit ?? 100)
    .toArray()
  return docs.map(toId) as BackupJob[]
}

export async function deleteById(id: string): Promise<boolean> {
  const c = await col()
  const result = await c.deleteOne({ _id: toObjectId(id) })
  return result.deletedCount === 1
}
