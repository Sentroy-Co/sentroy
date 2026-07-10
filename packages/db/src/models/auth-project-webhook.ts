import { randomBytes } from "node:crypto"
import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "auth_project_webhooks"

/**
 * Auth Project Webhook — RP'nin auth event'leri için kendi sunucusuna
 * webhook receiver kayıt eder. Sentroy auth event'i (signup, login,
 * password-changed, vb.) olunca HMAC-signed POST atılır.
 *
 * Status sayfalarındaki `status_subscribers` webhook pattern'iyle aynı
 * mantık ama auth-specific event topic'leri.
 */

export type AuthWebhookEventTopic =
  | "user.signup"
  | "user.login"
  | "user.password-changed"
  | "user.email-changed"
  | "user.account-locked"
  | "user.account-deleted"

export const AUTH_WEBHOOK_TOPICS: AuthWebhookEventTopic[] = [
  "user.signup",
  "user.login",
  "user.password-changed",
  "user.email-changed",
  "user.account-locked",
  "user.account-deleted",
]

export interface AuthProjectWebhook {
  id: string
  authProjectId: string
  /** Hedef URL — RP'nin kendi receiver endpoint'i. HTTPS önerilir. */
  url: string
  /** HMAC signing secret — plaintext saklanır (receiver tarafında da
   *  plaintext, ikisinin HMAC eşleşmesi için). Dashboard prefix gösterir,
   *  tam değer create + rotate response'unda kullanıcıya copy-once
   *  şeklinde döner. RSA private key gibi DB compromise olursa zaten
   *  her şey kompromize — secret'i ayrıca encrypt etmek savunma derinliği
   *  vermez (HMAC verify için plaintext lazım, on-the-fly decrypt aynı
   *  threat model'inde). */
  secret: string
  /** İlk 12 char (UI/debug için projeksiyon). */
  secretPrefix: string
  /** Hangi topic'lere abone. Boş [] = tüm topic'ler. */
  topicFilter: AuthWebhookEventTopic[]
  enabled: boolean
  description: string | null
  createdAt: Date
  updatedAt: Date
}

/** Sensitive `secret` field'ı drop edilmiş public projeksiyon. */
export type AuthProjectWebhookPublic = Omit<AuthProjectWebhook, "secret">

function publish(w: AuthProjectWebhook): AuthProjectWebhookPublic {
  const { secret: _s, ...rest } = w
  return rest
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

function generateSecret(): string {
  return `whsec_${randomBytes(24).toString("hex")}`
}

// ─── Queries ──────────────────────────────────────────────────────────────

export async function findById(id: string): Promise<AuthProjectWebhook | null> {
  const c = await col()
  const doc = await c.findOne({ _id: toObjectId(id) })
  return doc ? toId(doc) : null
}

export async function listByProject(
  authProjectId: string,
): Promise<AuthProjectWebhookPublic[]> {
  const c = await col()
  const docs = await c
    .find({ authProjectId })
    .sort({ createdAt: -1 })
    .toArray()
  return docs.map((d) => publish(toId(d) as AuthProjectWebhook))
}

/**
 * Bir event topic için dispatch hedeflerini bul. Topic filter boş [] olan
 * webhook'lar tüm topic'lere abone sayılır. Internal — dispatcher kullanır,
 * `secret` field'ı dahil döner (HMAC için).
 */
export async function listActiveForTopic(
  authProjectId: string,
  topic: AuthWebhookEventTopic,
): Promise<AuthProjectWebhook[]> {
  const c = await col()
  const docs = await c
    .find({
      authProjectId,
      enabled: true,
      $or: [{ topicFilter: { $size: 0 } }, { topicFilter: topic }],
    })
    .toArray()
  return docs.map((d) => toId(d) as AuthProjectWebhook)
}

// ─── Mutations ────────────────────────────────────────────────────────────

export async function create(input: {
  authProjectId: string
  url: string
  topicFilter?: AuthWebhookEventTopic[]
  description?: string | null
}): Promise<{ webhook: AuthProjectWebhookPublic; secret: string }> {
  const c = await col()
  const secret = generateSecret()
  const now = new Date()
  const doc = {
    authProjectId: input.authProjectId,
    url: input.url.trim(),
    secret,
    secretPrefix: secret.slice(0, 12),
    topicFilter: input.topicFilter ?? [],
    enabled: true,
    description: input.description ?? null,
    createdAt: now,
    updatedAt: now,
  }
  const result = await c.insertOne(doc)
  const webhook: AuthProjectWebhook = {
    id: result.insertedId.toString(),
    ...doc,
  }
  return { webhook: publish(webhook), secret }
}

export async function update(
  id: string,
  patch: Partial<
    Pick<
      AuthProjectWebhook,
      "url" | "topicFilter" | "enabled" | "description"
    >
  >,
): Promise<AuthProjectWebhookPublic | null> {
  const c = await col()
  const result = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    { $set: { ...patch, updatedAt: new Date() } },
    { returnDocument: "after" },
  )
  return result ? publish(toId(result) as AuthProjectWebhook) : null
}

export async function rotateSecret(
  id: string,
): Promise<{ webhook: AuthProjectWebhookPublic; secret: string } | null> {
  const c = await col()
  const secret = generateSecret()
  const result = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    {
      $set: {
        secret,
        secretPrefix: secret.slice(0, 12),
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" },
  )
  return result
    ? { webhook: publish(toId(result) as AuthProjectWebhook), secret }
    : null
}

export async function remove(id: string): Promise<boolean> {
  const c = await col()
  const r = await c.deleteOne({ _id: toObjectId(id) })
  return (r.deletedCount ?? 0) > 0
}

export async function removeByProject(
  authProjectId: string,
): Promise<number> {
  const c = await col()
  const r = await c.deleteMany({ authProjectId })
  return r.deletedCount ?? 0
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ authProjectId: 1 })
  await c.createIndex({ authProjectId: 1, enabled: 1 })
}
