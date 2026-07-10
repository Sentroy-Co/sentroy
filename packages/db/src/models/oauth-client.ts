import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"
import { randomBytes, createHash } from "crypto"

const COLLECTION = "oauth_clients"

/**
 * Sentroy Auth — third-party OAuth/OIDC client registration.
 *
 * Bir müşteri kendi web sitesine "Sentroy ile giriş yap" eklemek için
 * burada bir client kaydeder. `client_id` public, `client_secret` create
 * response'unda tek seferlik gösterilir; sonradan görünmez (SHA-256
 * hash'li saklanır).
 *
 * Scope'lar OIDC standardı: `openid`, `profile`, `email`.
 *
 * `companyId` null = system-managed (Sentroy'un kendi internal app'leri
 * için). Kullanıcı tarafından kayıtlananlar her zaman bir şirkete bağlı.
 */

export type OAuthScope = "openid" | "profile" | "email" | "offline_access"

export const ALLOWED_SCOPES: ReadonlySet<OAuthScope> = new Set([
  "openid",
  "profile",
  "email",
  "offline_access",
])

export interface OAuthClient {
  id: string
  /** Public identifier — `client_xxxxxxxxxxxx` (16 hex). */
  clientId: string
  /** SHA-256 of plaintext secret. Plaintext sadece create response'unda. */
  clientSecretHash: string
  /** İlk 12 char (UI identifier). */
  clientSecretPrefix: string
  /** Human-readable app name (consent screen'de gösterilir). */
  name: string
  description: string | null
  /** Allow-list — authorize request'te bu liste'de OLMAYAN redirect_uri reddedilir. */
  redirectUris: string[]
  /** Bu client'ın isteyebileceği max scope set'i (request edilen ⊆ izin verilen). */
  allowedScopes: OAuthScope[]
  homepageUrl: string | null
  logoUrl: string | null
  /** Sahibi şirket — null = system. */
  companyId: string | null
  createdBy: string
  enabled: boolean
  /** Son kullanım izi (lastUsedAt). */
  lastUsedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

function generateClientId(): string {
  return `client_${randomBytes(8).toString("hex")}`
}

function generateClientSecret(): string {
  return `secret_${randomBytes(24).toString("hex")}`
}

function hashSecret(plain: string): string {
  return createHash("sha256").update(plain).digest("hex")
}

export async function findByCompany(companyId: string): Promise<OAuthClient[]> {
  const c = await col()
  const docs = await c
    .find({ companyId })
    .sort({ createdAt: -1 })
    .toArray()
  return docs.map(toId)
}

export async function findById(id: string): Promise<OAuthClient | null> {
  const c = await col()
  const doc = await c.findOne({ _id: toObjectId(id) })
  return doc ? toId(doc) : null
}

export async function findByClientId(clientId: string): Promise<OAuthClient | null> {
  const c = await col()
  const doc = await c.findOne({ clientId })
  return doc ? toId(doc) : null
}

/**
 * Plain client_secret + clientId ile kimlik doğrulama. Token endpoint'inde
 * client authentication için. Constant-time karşılaştırma yapılmaz çünkü
 * SHA-256 zaten ön-hash'li; lookup hash üzerinden zaten timing-safe.
 */
export async function verifyClientCredentials(
  clientId: string,
  clientSecret: string,
): Promise<OAuthClient | null> {
  const client = await findByClientId(clientId)
  if (!client || !client.enabled) return null
  if (client.clientSecretHash !== hashSecret(clientSecret)) return null
  // Best-effort lastUsedAt update
  col()
    .then((c) =>
      c.updateOne(
        { _id: toObjectId(client.id) },
        { $set: { lastUsedAt: new Date() } },
      ),
    )
    .catch(() => {})
  return client
}

export async function create(input: {
  name: string
  description?: string | null
  redirectUris: string[]
  allowedScopes?: OAuthScope[]
  homepageUrl?: string | null
  logoUrl?: string | null
  companyId: string | null
  createdBy: string
}): Promise<{ client: OAuthClient; plainSecret: string }> {
  const c = await col()
  const now = new Date()
  const plainSecret = generateClientSecret()
  const doc = {
    clientId: generateClientId(),
    clientSecretHash: hashSecret(plainSecret),
    clientSecretPrefix: plainSecret.slice(0, 12),
    name: input.name.trim(),
    description: input.description ?? null,
    redirectUris: input.redirectUris,
    allowedScopes: input.allowedScopes ?? ["openid", "profile", "email"],
    homepageUrl: input.homepageUrl ?? null,
    logoUrl: input.logoUrl ?? null,
    companyId: input.companyId,
    createdBy: input.createdBy,
    enabled: true,
    lastUsedAt: null,
    createdAt: now,
    updatedAt: now,
  }
  const result = await c.insertOne(doc)
  return {
    client: { id: result.insertedId.toString(), ...doc },
    plainSecret,
  }
}

export async function update(
  id: string,
  patch: Partial<
    Pick<
      OAuthClient,
      | "name"
      | "description"
      | "redirectUris"
      | "allowedScopes"
      | "homepageUrl"
      | "logoUrl"
      | "enabled"
    >
  >,
): Promise<OAuthClient | null> {
  const c = await col()
  const result = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    { $set: { ...patch, updatedAt: new Date() } },
    { returnDocument: "after" },
  )
  return result ? toId(result) : null
}

export async function rotateSecret(
  id: string,
): Promise<{ client: OAuthClient; plainSecret: string } | null> {
  const c = await col()
  const plainSecret = generateClientSecret()
  const result = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    {
      $set: {
        clientSecretHash: hashSecret(plainSecret),
        clientSecretPrefix: plainSecret.slice(0, 12),
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" },
  )
  if (!result) return null
  return { client: toId(result), plainSecret }
}

export async function remove(id: string): Promise<boolean> {
  const c = await col()
  const result = await c.deleteOne({ _id: toObjectId(id) })
  return result.deletedCount === 1
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ clientId: 1 }, { unique: true })
  await c.createIndex({ companyId: 1 })
}
