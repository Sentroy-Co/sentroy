import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"
import { randomBytes } from "crypto"

const COLLECTION = "env_webhooks"

/**
 * Env-vault için outbound webhook. Bir variable.create / variable.update /
 * variable.delete olduğunda kayıtlı `(projectId, environment)` scope'undaki
 * tüm enabled webhook'lara HMAC-SHA256 imzalı POST atılır → app
 * tarafındaki receiver `refreshEnvCache()` çağırır, böylece TTL'i (5 dk)
 * beklemeden güncel değerler hits eder.
 *
 * Secret AES-256-GCM (env-vault-crypto) ile encrypted at rest. Plaintext
 * sadece create response'unda bir kez döner; sonradan görüntülenemez.
 */

export interface EnvWebhook {
  id: string
  projectId: string
  /** Hangi environment için fire eder. (project, environment) per-pair */
  environment: string
  /** İnsan-okur etiket (admin UI için). */
  name: string
  /** Receiver URL — app'in webhook handler endpoint'i. */
  url: string
  /** AES-256-GCM cipher; helper decrypt eder + HMAC için kullanır. */
  secretCipher: string
  /** İlk 8 char (UI identifier). */
  secretPrefix: string
  enabled: boolean
  /** Son fire denemesi (başarılı/başarısız fark etmez). */
  lastFiredAt: Date | null
  /** Son delivery HTTP status (null = hiç fire etmedi). */
  lastStatus: number | null
  /** Son delivery hatası mesajı (network/timeout vb.). */
  lastError: string | null
  createdBy: string
  createdAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

function generateSecret(): string {
  return `whsec_${randomBytes(32).toString("hex")}`
}

export async function findByProject(projectId: string): Promise<EnvWebhook[]> {
  const c = await col()
  const docs = await c
    .find({ projectId })
    .sort({ createdAt: -1 })
    .toArray()
  return docs.map(toId)
}

export async function findByProjectAndEnv(
  projectId: string,
  environment: string,
): Promise<EnvWebhook[]> {
  const c = await col()
  const docs = await c
    .find({ projectId, environment, enabled: true })
    .toArray()
  return docs.map(toId)
}

export async function findById(id: string): Promise<EnvWebhook | null> {
  const c = await col()
  const doc = await c.findOne({ _id: toObjectId(id) })
  return doc ? toId(doc) : null
}

export async function create(input: {
  projectId: string
  environment: string
  name: string
  url: string
  encryptedSecret: string
  secretPrefix: string
  enabled?: boolean
  createdBy: string
}): Promise<{ webhook: EnvWebhook; plainSecret: string | null }> {
  const c = await col()
  const now = new Date()
  const doc = {
    projectId: input.projectId,
    environment: input.environment,
    name: input.name.trim(),
    url: input.url,
    secretCipher: input.encryptedSecret,
    secretPrefix: input.secretPrefix,
    enabled: input.enabled ?? true,
    lastFiredAt: null,
    lastStatus: null,
    lastError: null,
    createdBy: input.createdBy,
    createdAt: now,
  }
  const result = await c.insertOne(doc)
  return {
    webhook: { id: result.insertedId.toString(), ...doc },
    // Plaintext caller tarafında (endpoint'te) generateSecret +
    // encryptValue ile yapılır; bu fonksiyon sadece DB write — plaintext
    // burada bilinmez. Caller plaintext'i ayrıca response'a koymalı.
    plainSecret: null,
  }
}

/** Test/admin amaçlı yeni plaintext secret üretici (caller'lara expose). */
export function generatePlaintextSecret(): string {
  return generateSecret()
}

export async function update(
  id: string,
  patch: Partial<Pick<EnvWebhook, "url" | "name" | "enabled">>,
): Promise<EnvWebhook | null> {
  const c = await col()
  const result = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    { $set: patch },
    { returnDocument: "after" },
  )
  return result ? toId(result) : null
}

export async function recordDelivery(
  id: string,
  status: number | null,
  error: string | null,
): Promise<void> {
  const c = await col()
  await c.updateOne(
    { _id: toObjectId(id) },
    {
      $set: {
        lastFiredAt: new Date(),
        lastStatus: status,
        lastError: error,
      },
    },
  )
}

export async function remove(id: string): Promise<boolean> {
  const c = await col()
  const result = await c.deleteOne({ _id: toObjectId(id) })
  return result.deletedCount === 1
}

export async function removeByProject(projectId: string): Promise<number> {
  const c = await col()
  const result = await c.deleteMany({ projectId })
  return result.deletedCount
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ projectId: 1, environment: 1 })
  await c.createIndex({ projectId: 1 })
}
