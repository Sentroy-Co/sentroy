import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"
import { randomBytes, createHash, generateKeyPairSync } from "crypto"

const COLLECTION = "auth_projects"

/**
 * Sentroy **Auth-as-a-Service** project — Firebase Auth alternatifi.
 *
 * Bir Sentroy şirket account'u, kendi end-user havuzlarını host etmek
 * için bir veya daha fazla "Auth Project" oluşturur. Her project'in
 * kendi izole user pool'u, kendi JWT signing key'i, kendi API key'i
 * vardır.
 *
 * **OAuth Client vs Auth Project — farkı:**
 *   - OAuth Client (`oauth-client` modeli) = "Sign in with Sentroy"
 *     federasyonu — kullanıcı Sentroy hesabıyla giriş yapar
 *   - Auth Project = kendi kullanıcı tabanını Sentroy üzerinde host
 *     etmek — kullanıcılar Sentroy hesabı bilmez, RP'nin kendi
 *     kullanıcısı olarak signup/login yapar
 *
 * **JWT signing**: per-project RSA 2048-bit keypair (RS256). JWKS publish
 * için public JWK doc'ta hazır tutulur; private key sadece sign sırasında
 * okunur. Migration safe — ileride key rotation eklemek için `keyPrevious`
 * field'ı ayrılır (henüz boş; v2'de aktive).
 */

export type AuthProjectPlan = "free" | "pro"

export interface AuthProjectPasswordPolicy {
  minLength: number
  requireUppercase: boolean
  requireNumber: boolean
}

export interface AuthProjectBranding {
  displayName: string
  primaryColor: string | null
  logoUrl: string | null
}

export interface AuthProjectQuotaUsage {
  mau: number
  signupsThisHour: number
  lastResetAt: Date
}

export interface AuthProject {
  id: string
  companyId: string
  /** Human-readable name (dashboard'da gösterilir). */
  name: string
  /** URL-safe slug — public route segment'i. Unique per Sentroy platform. */
  slug: string
  /** Public identifier — `apr_<8hex>`. */
  projectId: string
  /** SHA-256 of plaintext API key. Plaintext sadece create response'unda. */
  apiKeyHash: string
  /** İlk 12 char (UI identifier, `aps_<8hex>...`). */
  apiKeyPrefix: string
  /** JWT signing mode. v1: yalnızca RS256. */
  jwtSigningMode: "RS256"
  /** Private key PEM (PKCS#8). Server-only — listing'te DROP edilir. */
  rsaPrivateKey: string
  /** Public JWK (kty:RSA, n, e, kid, use:sig, alg:RS256). JWKS endpoint'inde publish. */
  rsaPublicJwk: Record<string, unknown>
  /** **Rotation grace slot** — manuel rotate sonrası eski private key
   *  burada saklanır, yeni token'lar yeni key ile imzalanır ama RP/SDK
   *  tarafındaki eski cache'lenmiş JWKS hâlâ doğrulayabilsin diye eski
   *  key bir süre geçerli kalır. Verify pipeline her iki key'i de dener;
   *  JWKS endpoint her ikisini de publish eder. Cron veya next-rotate ile
   *  null'a alınır (grace bitince). */
  previousRsaPrivateKey: string | null
  previousRsaPublicJwk: Record<string, unknown> | null
  /** ISO timestamp — son rotate'in ne zaman olduğu (grace expiry hesabı için). */
  previousRotatedAt: Date | null
  /** CORS allow-list — public auth API'leri origin check'i. Boş = wildcard reddedilir. */
  allowedOrigins: string[]
  emailVerificationRequired: boolean
  magicLinkEnabled: boolean
  passwordPolicy: AuthProjectPasswordPolicy
  branding: AuthProjectBranding
  quotaUsage: AuthProjectQuotaUsage
  plan: AuthProjectPlan
  /** Max monthly active users (plan'a göre). */
  maxMau: number
  /** Saatlik max signup (anti-abuse). */
  maxSignupsPerHour: number
  enabled: boolean
  /** **Custom JWT claims** — RP'nin per-user metadata field'larından
   *  hangilerinin access token JWT'sine kopyalanacağı + static claims.
   *  `fromMetadata` whitelist (deep-key access yok, top-level key only).
   *  `staticClaims` her token'a sabit eklenir (aud override hariç). */
  customClaims: {
    fromMetadata: string[]
    staticClaims: Record<string, string | number | boolean>
  }
  /** **Social provider federation** — per-project OAuth provider config.
   *  ClientSecret/privateKey AES-GCM şifrelidir; ClientId public.
   *
   *  Google/GitHub/Facebook/Microsoft: standart OAuth 2.0 (clientId + secret).
   *  X: PKCE + bearer (clientId + secret). Email yoksa username@x.local
   *  placeholder kullanılır.
   *  Apple: ECDSA-signed JWT client_secret (runtime üretilir). teamId,
   *  keyId, p8 private key gerekli; client_secret runtime'da imzalanır. */
  socialProviders: {
    google?: {
      enabled: boolean
      clientId: string
      clientSecretEncrypted: string
    }
    github?: {
      enabled: boolean
      clientId: string
      clientSecretEncrypted: string
    }
    facebook?: {
      enabled: boolean
      clientId: string
      clientSecretEncrypted: string
    }
    microsoft?: {
      enabled: boolean
      clientId: string
      clientSecretEncrypted: string
      /** Default "common"; tenant-specific Entra için "{tenant-uuid}". */
      tenant?: string
    }
    twitter?: {
      enabled: boolean
      clientId: string
      clientSecretEncrypted: string
    }
    apple?: {
      enabled: boolean
      /** Apple Service ID (com.example.signin) — RP'nin Apple Developer
       *  panel'inde tanımlı, OAuth client_id rolü oynar. */
      clientId: string
      /** Apple Team ID (10-char). */
      teamId: string
      /** Apple Key ID (10-char) — p8 key'i tanımlar. */
      keyId: string
      /** Apple Sign-In p8 private key PEM (encrypted). */
      privateKeyEncrypted: string
    }
  }
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

/** Safe-to-publish projection — apiKeyHash + rsaPrivateKey drop. */
export type AuthProjectPublic = Omit<
  AuthProject,
  "apiKeyHash" | "rsaPrivateKey" | "previousRsaPrivateKey"
>

const DEFAULT_PASSWORD_POLICY: AuthProjectPasswordPolicy = {
  minLength: 8,
  requireUppercase: false,
  requireNumber: false,
}

const FREE_TIER_MAU = 5000
const FREE_TIER_SIGNUPS_PER_HOUR = 100

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

function generateProjectId(): string {
  return `apr_${randomBytes(4).toString("hex")}`
}

function generateApiKey(): string {
  // `aps_` = "auth project secret". Format mirrors AccessToken `stk_`.
  return `aps_${randomBytes(24).toString("hex")}`
}

function hashKey(plain: string): string {
  return createHash("sha256").update(plain).digest("hex")
}

function rfc7638Thumbprint(jwk: Record<string, unknown>): string {
  // RFC 7638 JWK Thumbprint — canonical JSON of required fields, SHA-256.
  const canonical = JSON.stringify({
    e: jwk.e,
    kty: jwk.kty,
    n: jwk.n,
  })
  return createHash("sha256").update(canonical).digest("base64url")
}

function generateRsaKeypair(): {
  privateKey: string
  publicJwk: Record<string, unknown>
} {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  })
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }) as string
  const jwk = publicKey.export({ format: "jwk" }) as Record<string, unknown>
  const kid = rfc7638Thumbprint(jwk)
  return {
    privateKey: pem,
    publicJwk: { ...jwk, kid, use: "sig", alg: "RS256" },
  }
}

function safe(doc: AuthProject): AuthProjectPublic {
  const {
    apiKeyHash: _h,
    rsaPrivateKey: _r,
    previousRsaPrivateKey: _p,
    ...rest
  } = doc
  return rest
}

// ─── Queries ──────────────────────────────────────────────────────────────

export async function findById(id: string): Promise<AuthProject | null> {
  const c = await col()
  const doc = await c.findOne({ _id: toObjectId(id) })
  return doc ? toId(doc) : null
}

export async function findBySlug(slug: string): Promise<AuthProject | null> {
  const c = await col()
  const doc = await c.findOne({ slug })
  return doc ? toId(doc) : null
}

export async function findByProjectId(
  projectId: string,
): Promise<AuthProject | null> {
  const c = await col()
  const doc = await c.findOne({ projectId })
  return doc ? toId(doc) : null
}

export async function findByCompany(
  companyId: string,
): Promise<AuthProjectPublic[]> {
  const c = await col()
  const docs = await c.find({ companyId }).sort({ createdAt: -1 }).toArray()
  return docs.map((d) => safe(toId(d)))
}

/**
 * Public API key verification — `Authorization: Bearer aps_...` header
 * doğrulaması. Sentroy'un RP'sini authenticate eder; end-user JWT'sini
 * issue etmek için bu RP'nin valid bir project sahibi olduğunu kanıtlar.
 *
 * Constant-time comparison gerekmez — SHA-256 lookup zaten timing-safe.
 */
export async function verifyApiKey(
  apiKey: string,
): Promise<AuthProject | null> {
  const c = await col()
  const doc = await c.findOne({ apiKeyHash: hashKey(apiKey) })
  if (!doc) return null
  const proj = toId(doc) as AuthProject
  if (!proj.enabled) return null
  return proj
}

// ─── Mutations ────────────────────────────────────────────────────────────

export async function create(input: {
  companyId: string
  name: string
  slug: string
  branding?: Partial<AuthProjectBranding>
  emailVerificationRequired?: boolean
  magicLinkEnabled?: boolean
  passwordPolicy?: Partial<AuthProjectPasswordPolicy>
  allowedOrigins?: string[]
  plan?: AuthProjectPlan
  createdBy: string
}): Promise<{ project: AuthProject; plainApiKey: string }> {
  const c = await col()
  const now = new Date()
  const plainApiKey = generateApiKey()
  const { privateKey, publicJwk } = generateRsaKeypair()

  const branding: AuthProjectBranding = {
    displayName: input.branding?.displayName ?? input.name,
    primaryColor: input.branding?.primaryColor ?? null,
    logoUrl: input.branding?.logoUrl ?? null,
  }

  const passwordPolicy: AuthProjectPasswordPolicy = {
    ...DEFAULT_PASSWORD_POLICY,
    ...input.passwordPolicy,
  }

  const doc = {
    companyId: input.companyId,
    name: input.name.trim(),
    slug: input.slug.trim().toLowerCase(),
    projectId: generateProjectId(),
    apiKeyHash: hashKey(plainApiKey),
    apiKeyPrefix: plainApiKey.slice(0, 12),
    jwtSigningMode: "RS256" as const,
    rsaPrivateKey: privateKey,
    rsaPublicJwk: publicJwk,
    previousRsaPrivateKey: null,
    previousRsaPublicJwk: null,
    previousRotatedAt: null,
    allowedOrigins: input.allowedOrigins ?? [],
    emailVerificationRequired: input.emailVerificationRequired ?? true,
    magicLinkEnabled: input.magicLinkEnabled ?? false,
    passwordPolicy,
    branding,
    quotaUsage: { mau: 0, signupsThisHour: 0, lastResetAt: now },
    plan: input.plan ?? "free",
    maxMau: FREE_TIER_MAU,
    maxSignupsPerHour: FREE_TIER_SIGNUPS_PER_HOUR,
    enabled: true,
    customClaims: { fromMetadata: [] as string[], staticClaims: {} as Record<string, string | number | boolean> },
    socialProviders: {} as AuthProject["socialProviders"],
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  }
  const result = await c.insertOne(doc)
  return {
    project: { id: result.insertedId.toString(), ...doc },
    plainApiKey,
  }
}

export async function update(
  id: string,
  patch: Partial<
    Pick<
      AuthProject,
      | "name"
      | "branding"
      | "emailVerificationRequired"
      | "magicLinkEnabled"
      | "passwordPolicy"
      | "allowedOrigins"
      | "enabled"
      | "customClaims"
      | "socialProviders"
    >
  >,
): Promise<AuthProject | null> {
  const c = await col()
  const result = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    { $set: { ...patch, updatedAt: new Date() } },
    { returnDocument: "after" },
  )
  return result ? toId(result) : null
}

export async function rotateApiKey(
  id: string,
): Promise<{ project: AuthProject; plainApiKey: string } | null> {
  const c = await col()
  const plainApiKey = generateApiKey()
  const result = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    {
      $set: {
        apiKeyHash: hashKey(plainApiKey),
        apiKeyPrefix: plainApiKey.slice(0, 12),
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" },
  )
  if (!result) return null
  return { project: toId(result), plainApiKey }
}

/**
 * JWT keypair rotate — yeni RSA keypair generate, mevcut key'i
 * `previousRsa*` slot'una taşı (grace period). Bundan sonra issue
 * edilen JWT'ler yeni key ile imzalanır; verify pipeline her iki key'i
 * de dener; JWKS endpoint her ikisini de publish eder (RP'lerin
 * cache'lenmiş JWKS'leri yumuşak geçiş sağlasın).
 *
 * Grace period: caller (cron veya manuel) `clearPreviousJwtKey` ile
 * eski key'i revoke eder. Default önerilen pencere: 7 gün (tipik
 * client-side JWKS cache TTL'inden uzun).
 */
export async function rotateJwtKey(
  id: string,
): Promise<AuthProject | null> {
  const c = await col()
  const current = await c.findOne({ _id: toObjectId(id) })
  if (!current) return null

  const { privateKey: newPrivate, publicJwk: newJwk } = generateRsaKeypair()
  const now = new Date()
  const result = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    {
      $set: {
        rsaPrivateKey: newPrivate,
        rsaPublicJwk: newJwk,
        previousRsaPrivateKey: current.rsaPrivateKey as string,
        previousRsaPublicJwk: current.rsaPublicJwk as Record<string, unknown>,
        previousRotatedAt: now,
        updatedAt: now,
      },
    },
    { returnDocument: "after" },
  )
  return result ? toId(result) : null
}

/**
 * Grace period bitti — eski key'i sil. Bundan sonra eski key ile
 * imzalanmış JWT'ler verify edilmez (clients should have re-fetched
 * JWKS by now). Cron job veya manuel admin action.
 */
export async function clearPreviousJwtKey(
  id: string,
): Promise<AuthProject | null> {
  const c = await col()
  const result = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    {
      $set: {
        previousRsaPrivateKey: null,
        previousRsaPublicJwk: null,
        previousRotatedAt: null,
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" },
  )
  return result ? toId(result) : null
}

export async function remove(id: string): Promise<boolean> {
  const c = await col()
  const result = await c.deleteOne({ _id: toObjectId(id) })
  return result.deletedCount === 1
}

/**
 * Atomic signup quota increment + check. Returns false if exceeded.
 * `lastResetAt`'tan 1 saat geçtiyse counter sıfırlanır.
 */
export async function incrementSignupCounter(
  id: string,
): Promise<{ allowed: boolean; current: number; limit: number } | null> {
  const c = await col()
  const proj = await findById(id)
  if (!proj) return null

  const now = new Date()
  const oneHourMs = 60 * 60 * 1000
  const shouldReset =
    now.getTime() - proj.quotaUsage.lastResetAt.getTime() > oneHourMs

  if (shouldReset) {
    await c.updateOne(
      { _id: toObjectId(id) },
      {
        $set: {
          "quotaUsage.signupsThisHour": 1,
          "quotaUsage.lastResetAt": now,
        },
      },
    )
    return { allowed: true, current: 1, limit: proj.maxSignupsPerHour }
  }

  if (proj.quotaUsage.signupsThisHour >= proj.maxSignupsPerHour) {
    return {
      allowed: false,
      current: proj.quotaUsage.signupsThisHour,
      limit: proj.maxSignupsPerHour,
    }
  }

  const updated = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    { $inc: { "quotaUsage.signupsThisHour": 1 } },
    { returnDocument: "after" },
  )
  return {
    allowed: true,
    current: updated?.quotaUsage?.signupsThisHour ?? 0,
    limit: proj.maxSignupsPerHour,
  }
}

export async function publish(project: AuthProject): Promise<AuthProjectPublic> {
  return safe(project)
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ slug: 1 }, { unique: true })
  await c.createIndex({ projectId: 1 }, { unique: true })
  await c.createIndex({ apiKeyHash: 1 }, { unique: true })
  await c.createIndex({ companyId: 1 })
}
