import { getDb } from "../client"
import { toId } from "./_helpers"
import { randomBytes, createHash } from "crypto"

const COLLECTION = "oauth_authorization_codes"
const TTL_MS = 10 * 60 * 1000 // 10 minutes

/**
 * OAuth authorization code — `/oauth/authorize` issue eder, `/oauth/token`
 * tek seferlik consume eder. Plaintext code asla DB'de tutulmaz; SHA-256
 * hash'li lookup. Code hem URL'de visible olduğu için kısa-yaşamlı (10dk),
 * hem de tek kullanımlık (consumedAt set edildikten sonra reuse fail).
 *
 * Authorization code grant flow:
 *   1. /oauth/authorize → user consents → 302 to redirect_uri?code=XXX&state=YYY
 *   2. RP backend → POST /oauth/token { grant_type, code, redirect_uri, client_id, client_secret }
 *   3. Server: lookup code, check (clientId, redirectUri) match, check unconsumed,
 *      check unexpired → mark consumed, issue access_token + id_token
 */

export interface OAuthAuthorizationCode {
  id: string
  /** SHA-256 of plaintext. */
  codeHash: string
  /** İlk 8 char (debug). */
  codePrefix: string
  /** Hangi client için issue edildi. */
  clientId: string
  /** Hangi user authorize etti. */
  userId: string
  /** Issue anında bound edilen redirect_uri — token exchange'de eşleşmeli. */
  redirectUri: string
  /** Onaylanan scope'lar. */
  scopes: string[]
  /** OIDC `nonce` parametresi (id_token claim olarak echo edilir). */
  nonce: string | null
  /**
   * PKCE (RFC 7636) — authorize aşamasında verilen code_challenge.
   * Token exchange'de RP `code_verifier` gönderir; SHA-256(verifier)'ın
   * base64url-encoded hali bu alanla eşleşmeli. null = PKCE'siz issue
   * edildi, token request'te code_verifier ignore edilir.
   */
  codeChallenge: string | null
  /** Şu an sadece "S256" destekliyoruz; "plain" reddedilir. */
  codeChallengeMethod: "S256" | null
  expiresAt: Date
  /** Tek-kullanım: ilk consume'da set, sonraki istek 400 alır. */
  consumedAt: Date | null
  createdAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

function generateCode(): string {
  return `oac_${randomBytes(24).toString("hex")}`
}

function hash(plain: string): string {
  return createHash("sha256").update(plain).digest("hex")
}

export async function create(input: {
  clientId: string
  userId: string
  redirectUri: string
  scopes: string[]
  nonce: string | null
  codeChallenge?: string | null
  codeChallengeMethod?: "S256" | null
}): Promise<{ code: string; record: OAuthAuthorizationCode }> {
  const c = await col()
  const code = generateCode()
  const now = new Date()
  const doc = {
    codeHash: hash(code),
    codePrefix: code.slice(0, 8),
    clientId: input.clientId,
    userId: input.userId,
    redirectUri: input.redirectUri,
    scopes: input.scopes,
    nonce: input.nonce,
    codeChallenge: input.codeChallenge ?? null,
    codeChallengeMethod: input.codeChallengeMethod ?? null,
    expiresAt: new Date(now.getTime() + TTL_MS),
    consumedAt: null,
    createdAt: now,
  }
  const result = await c.insertOne(doc)
  return {
    code,
    record: { id: result.insertedId.toString(), ...doc },
  }
}

/**
 * Token endpoint helper — atomik consume:
 *   1. codeHash ile lookup
 *   2. consumedAt zaten set ise null dön (replay attack)
 *   3. expiresAt geçmiş ise null dön
 *   4. clientId + redirectUri eşleşmiyorsa null dön
 *   5. consumedAt set + record dön
 */
export async function consume(
  plainCode: string,
  expectedClientId: string,
  expectedRedirectUri: string,
): Promise<OAuthAuthorizationCode | null> {
  const c = await col()
  const now = new Date()
  const result = await c.findOneAndUpdate(
    {
      codeHash: hash(plainCode),
      clientId: expectedClientId,
      redirectUri: expectedRedirectUri,
      consumedAt: null,
      expiresAt: { $gt: now },
    },
    { $set: { consumedAt: now } },
    { returnDocument: "after" },
  )
  return result ? toId(result) : null
}

/** Periyodik temizlik (cron). Henüz scheduler bağlamadık; expiresAt + 1 saat geç olmuş kayıtları sil. */
export async function pruneExpired(): Promise<number> {
  const c = await col()
  const cutoff = new Date(Date.now() - 60 * 60 * 1000) // 1 hour past expiry
  const r = await c.deleteMany({ expiresAt: { $lt: cutoff } })
  return r.deletedCount ?? 0
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ codeHash: 1 }, { unique: true })
  // TTL index — Mongo otomatik eviction (expiresAt geçince doc silinir)
  await c.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 3600 })
}
