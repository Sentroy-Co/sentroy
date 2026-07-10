import { ObjectId } from "mongodb"
import { getDb } from "../client"
import { toId } from "./_helpers"

/**
 * MongoDB Backuper — yedek/restore iş kaydı (company-scoped).
 *
 * Koleksiyon: `mongo_backup_jobs`. apps/backup-worker aynı koleksiyona RAW
 * mongodb driver ile status/progress yazar → alan adları bu şema ile BİREBİR
 * eşleşmeli (worker'da workspace import yok). Kredensiyal ASLA saklanmaz —
 * yalnız connectionId referansı; URI'ler mongo_connections'da şifreli durur.
 */

const COLLECTION = "mongo_backup_jobs"

export type BackupJobKind = "backup" | "restore"
export type BackupJobStatus = "queued" | "running" | "success" | "failed"

export interface MongoBackupJob {
  id: string
  companyId: string
  kind: BackupJobKind
  status: BackupJobStatus
  /** Yedek: dump edilen DB. Restore: hedef DB adı. */
  dbName: string
  /** Kaynak/hedef bağlantı (backup: kaynak, restore: hedef). */
  connectionId: string
  connectionLabel: string
  /** Restore işinde: hangi backup job'ın artefaktı geri yükleniyor. */
  sourceJobId: string | null
  /** S3 artefakt (backup: yazılan; restore: okunan). */
  s3Key: string | null
  sizeBytes: number | null
  /** Restore --drop (yıkıcı): hedef koleksiyonlar önce silinir. */
  drop: boolean
  /** 0-100; worker günceller. */
  progress: number
  /** Kısa insan-okur aşama etiketi (dumping/uploading/restoring…). */
  stage: string | null
  error: string | null
  triggeredByUserId: string
  triggeredByEmail: string | null
  startedAt: Date | null
  finishedAt: Date | null
  /** Retention — artefaktın silineceği zaman (null = süresiz). */
  artifactExpiresAt: Date | null
  createdAt: Date
  updatedAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function create(data: {
  companyId: string
  kind: BackupJobKind
  dbName: string
  connectionId: string
  connectionLabel: string
  sourceJobId?: string | null
  s3Key?: string | null
  drop?: boolean
  triggeredByUserId: string
  triggeredByEmail?: string | null
  artifactExpiresAt?: Date | null
}): Promise<MongoBackupJob> {
  const c = await col()
  const now = new Date()
  const doc = {
    companyId: data.companyId,
    kind: data.kind,
    status: "queued" as BackupJobStatus,
    dbName: data.dbName,
    connectionId: data.connectionId,
    connectionLabel: data.connectionLabel,
    sourceJobId: data.sourceJobId ?? null,
    s3Key: data.s3Key ?? null,
    sizeBytes: null as number | null,
    drop: data.drop ?? false,
    progress: 0,
    stage: null as string | null,
    error: null as string | null,
    triggeredByUserId: data.triggeredByUserId,
    triggeredByEmail: data.triggeredByEmail ?? null,
    startedAt: null as Date | null,
    finishedAt: null as Date | null,
    artifactExpiresAt: data.artifactExpiresAt ?? null,
    createdAt: now,
    updatedAt: now,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

export async function findById(id: string): Promise<MongoBackupJob | null> {
  if (!ObjectId.isValid(id)) return null
  const c = await col()
  const doc = await c.findOne({ _id: new ObjectId(id) })
  return toId(doc) as MongoBackupJob | null
}

export async function findByIdForCompany(
  id: string,
  companyId: string,
): Promise<MongoBackupJob | null> {
  if (!ObjectId.isValid(id)) return null
  const c = await col()
  const doc = await c.findOne({ _id: new ObjectId(id), companyId })
  return toId(doc) as MongoBackupJob | null
}

export async function listByCompany(
  companyId: string,
  opts?: { connectionId?: string; kind?: BackupJobKind; limit?: number; skip?: number },
): Promise<MongoBackupJob[]> {
  const c = await col()
  const q: Record<string, unknown> = { companyId }
  if (opts?.connectionId) q.connectionId = opts.connectionId
  if (opts?.kind) q.kind = opts.kind
  const docs = await c
    .find(q)
    .sort({ createdAt: -1 })
    .skip(opts?.skip ?? 0)
    .limit(opts?.limit ?? 50)
    .toArray()
  return docs.map((d) => toId(d) as MongoBackupJob)
}

export async function countByCompany(
  companyId: string,
  opts?: { connectionId?: string; kind?: BackupJobKind },
): Promise<number> {
  const c = await col()
  const q: Record<string, unknown> = { companyId }
  if (opts?.connectionId) q.connectionId = opts.connectionId
  if (opts?.kind) q.kind = opts.kind
  return c.countDocuments(q)
}

/** Bir bağlantıda aktif (queued/running) job var mı — aynı anda tek iş guard'ı. */
export async function hasActive(companyId: string, connectionId: string): Promise<boolean> {
  const c = await col()
  const n = await c.countDocuments({
    companyId,
    connectionId,
    status: { $in: ["queued", "running"] },
  })
  return n > 0
}

/** Job oluşturulduktan sonra S3 key'i yaz (jobId'den türetilir). */
export async function setS3Key(id: string, s3Key: string): Promise<void> {
  if (!ObjectId.isValid(id)) return
  const c = await col()
  await c.updateOne(
    { _id: new ObjectId(id) },
    { $set: { s3Key, updatedAt: new Date() } },
  )
}

/** Worker ulaşılamazsa job'u başarısız işaretle (app tarafı senkron hata). */
export async function markFailed(id: string, error: string): Promise<void> {
  if (!ObjectId.isValid(id)) return
  const c = await col()
  await c.updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        status: "failed" as BackupJobStatus,
        error,
        finishedAt: new Date(),
        updatedAt: new Date(),
      },
    },
  )
}

export async function remove(id: string, companyId: string): Promise<MongoBackupJob | null> {
  if (!ObjectId.isValid(id)) return null
  const c = await col()
  const doc = await c.findOne({ _id: new ObjectId(id), companyId })
  if (!doc) return null
  await c.deleteOne({ _id: new ObjectId(id), companyId })
  return toId(doc) as MongoBackupJob
}

/** Bir bağlantı silindiğinde: o bağlantıya ait job kayıtları da temizlenir. */
export async function removeByConnection(connectionId: string, companyId: string): Promise<void> {
  const c = await col()
  await c.deleteMany({ connectionId, companyId })
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ companyId: 1, createdAt: -1 })
  await c.createIndex({ companyId: 1, connectionId: 1, createdAt: -1 })
}
