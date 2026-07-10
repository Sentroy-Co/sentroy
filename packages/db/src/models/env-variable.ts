import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "env_variables"

/**
 * Tek bir env variable — her bir (project, environment, key) için unique
 * doc. Value plaintext değil — `valueCipher` AES-256-GCM ile şifreli;
 * decrypt anahtarı master env'den (`SENTROY_ENV_MASTER_KEY`) okunur.
 *
 * **public flag**: true ise değer client'a (browser bundle / `useEnv`
 * hook'una) sızabilir; false ise yalnızca server-side `getEnv()` ile
 * erişilir, public fetch endpoint'i bu var'ı asla döndürmez.
 *
 * Type'lar — UI ipuçları için. Storage hep string; encryption sırasında
 * tip korunmaz, decrypt sonrası caller cast eder.
 */
export type EnvVariableType = "string" | "number" | "boolean" | "json" | "url"

export interface EnvVariable {
  id: string
  projectId: string
  /** Environment slug — "dev"/"staging"/"prod"/custom. Free-form. */
  environment: string
  /** Variable key — uppercase by convention, ör. `DATABASE_URL`. */
  key: string
  /** AES-256-GCM cipher text + iv + tag (base64-joined, helpers'ta tek string). */
  valueCipher: string
  /** UI hint için tip; storage decode etmiyor — caller cast eder. */
  type: EnvVariableType
  /** True ise client'a sızabilir (NEXT_PUBLIC_* benzeri). */
  public: boolean
  /** İsteğe bağlı insan-okur açıklama (admin UI'da). */
  description: string | null
  /** Hangi user oluşturdu/değiştirdi (audit log'la birlikte). */
  updatedBy: string
  createdAt: Date
  updatedAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function findByProjectAndEnv(
  projectId: string,
  environment: string,
): Promise<EnvVariable[]> {
  const c = await col()
  const docs = await c
    .find({ projectId, environment })
    .sort({ key: 1 })
    .toArray()
  return docs.map(toId)
}

export async function findOne(
  projectId: string,
  environment: string,
  key: string,
): Promise<EnvVariable | null> {
  const c = await col()
  const doc = await c.findOne({ projectId, environment, key })
  return doc ? toId(doc) : null
}

export async function listEnvironments(
  projectId: string,
): Promise<string[]> {
  const c = await col()
  const envs = await c.distinct("environment", { projectId })
  return (envs as string[]).sort()
}

export async function upsert(input: {
  projectId: string
  environment: string
  key: string
  valueCipher: string
  type?: EnvVariableType
  public?: boolean
  description?: string | null
  updatedBy: string
}): Promise<EnvVariable> {
  const c = await col()
  const now = new Date()
  const filter = {
    projectId: input.projectId,
    environment: input.environment,
    key: input.key,
  }
  await c.updateOne(
    filter,
    {
      $set: {
        valueCipher: input.valueCipher,
        type: input.type ?? "string",
        public: input.public ?? false,
        description: input.description ?? null,
        updatedBy: input.updatedBy,
        updatedAt: now,
      },
      $setOnInsert: {
        ...filter,
        createdAt: now,
      },
    },
    { upsert: true },
  )
  const doc = await c.findOne(filter)
  return toId(doc)
}

export async function remove(id: string): Promise<boolean> {
  const c = await col()
  const result = await c.deleteOne({ _id: toObjectId(id) })
  return result.deletedCount === 1
}

export async function removeByProjectAndEnv(
  projectId: string,
  environment: string,
): Promise<number> {
  const c = await col()
  const result = await c.deleteMany({ projectId, environment })
  return result.deletedCount
}

export async function removeByProject(projectId: string): Promise<number> {
  const c = await col()
  const result = await c.deleteMany({ projectId })
  return result.deletedCount
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex(
    { projectId: 1, environment: 1, key: 1 },
    { unique: true },
  )
  await c.createIndex({ projectId: 1, environment: 1 })
}
