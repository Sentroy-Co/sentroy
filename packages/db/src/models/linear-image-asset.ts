import { randomBytes } from "crypto"
import { getDb } from "../client"
import { toId } from "./_helpers"

/**
 * Linear Lite — issue description'larına gömülen görsel varlık kaydı. Markdown
 * içinde upload URL'i yerine opak `sntr_…` token'ı yazılır; render sırasında
 * token'lar bu koleksiyondan gerçek URL'lere geri çözülür
 * (`remapDescriptionImages`). Company-scoped — her sorguda companyId filtresi
 * zorunlu (tenant izolasyonu). Bkz. [[linear-settings]].
 */

const COLLECTION = "linear_image_assets"

export interface LinearImageAsset {
  id: string
  companyId: string
  /** Opak referans token'ı — `"sntr_" + 8-byte hex`, global unique. */
  token: string
  /** Görselin asıl (tam boy) URL'i. */
  url: string
  /** Küçük önizleme URL'i (varsa). */
  previewUrl: string | null
  createdAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

/** `"sntr_" + 8-byte hex` formatında yeni token üretir. */
export function generateToken(): string {
  return `sntr_${randomBytes(8).toString("hex")}`
}

export async function create(data: {
  companyId: string
  url: string
  previewUrl?: string | null
  /** Verilmezse model kendisi üretir. */
  token?: string
}): Promise<LinearImageAsset> {
  const c = await col()
  const doc = {
    companyId: data.companyId,
    token: data.token ?? generateToken(),
    url: data.url,
    previewUrl: data.previewUrl ?? null,
    createdAt: new Date(),
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

export async function findByTokens(
  companyId: string,
  tokens: string[],
): Promise<LinearImageAsset[]> {
  if (tokens.length === 0) return []
  const c = await col()
  const docs = await c
    .find({ companyId, token: { $in: tokens } })
    .toArray()
  return docs.map(toId) as LinearImageAsset[]
}

export async function deleteByCompany(companyId: string): Promise<void> {
  const c = await col()
  await c.deleteMany({ companyId })
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ token: 1 }, { unique: true })
  await c.createIndex({ companyId: 1, createdAt: -1 })
}
