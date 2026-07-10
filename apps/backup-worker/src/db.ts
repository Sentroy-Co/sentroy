import { MongoClient, ObjectId, type Db } from "mongodb"
import { decryptValue } from "./crypto"

/**
 * Platform Mongo bağlantısı (worker → mongo:27017 internal). Bağlantı kaydını
 * okuyup URI'yi decrypt eder + job status'unu günceller. @workspace/db import
 * edilmez (worker standalone) → raw driver; koleksiyon/alan adları
 * packages/db/src/models/mongo-{connection,backup-job}.ts ile eşleşir.
 */

const URI = process.env.MONGODB_URI || ""
const DB_NAME = process.env.MONGODB_DATABASE || ""

let clientPromise: Promise<MongoClient> | null = null

async function getClient(): Promise<MongoClient> {
  if (!URI) throw new Error("MONGODB_URI not set")
  if (!clientPromise) {
    clientPromise = new MongoClient(URI, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 10_000,
    }).connect()
  }
  return clientPromise
}

async function platformDb(): Promise<Db> {
  const c = await getClient()
  return DB_NAME ? c.db(DB_NAME) : c.db()
}

export interface ResolvedConnection {
  uri: string
  label: string
  defaultDbName: string | null
}

/** Bağlantı kaydını okuyup URI'yi decrypt eder (company-scope zorunlu). */
export async function resolveConnection(
  connectionId: string,
  companyId: string,
): Promise<ResolvedConnection | null> {
  if (!ObjectId.isValid(connectionId)) return null
  const db = await platformDb()
  const doc = await db
    .collection("mongo_connections")
    .findOne({ _id: new ObjectId(connectionId), companyId })
  if (!doc) return null
  return {
    uri: decryptValue(doc.uriEncrypted as string),
    label: (doc.label as string) ?? "connection",
    defaultDbName: (doc.defaultDbName as string | null) ?? null,
  }
}

export interface JobPatch {
  status?: "queued" | "running" | "success" | "failed"
  progress?: number
  stage?: string | null
  s3Key?: string | null
  sizeBytes?: number | null
  error?: string | null
  startedAt?: Date
  finishedAt?: Date
}

export async function updateJob(jobId: string, patch: JobPatch): Promise<void> {
  if (!ObjectId.isValid(jobId)) return
  const db = await platformDb()
  await db
    .collection("mongo_backup_jobs")
    .updateOne(
      { _id: new ObjectId(jobId) },
      { $set: { ...patch, updatedAt: new Date() } },
    )
}

export async function touchConnectionLastBackup(connectionId: string): Promise<void> {
  if (!ObjectId.isValid(connectionId)) return
  const db = await platformDb()
  await db
    .collection("mongo_connections")
    .updateOne(
      { _id: new ObjectId(connectionId) },
      { $set: { lastBackupAt: new Date() } },
    )
}
