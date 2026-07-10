import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "user_passkeys"

/**
 * WebAuthn / FIDO2 credential. Bir kullanıcının birden fazla cihaz/passkey'i
 * olabilir (telefon, dizüstü TouchID, donanım anahtar). Her credential
 * kendi public key + counter'ını saklar.
 *
 * counter: replay attack'e karşı; her başarılı authentication sonrası
 * authenticator'dan dönen counter'ın artması beklenir. Inkrement yapmıyorsa
 * ya cloud-synced passkey (Apple/Google) ya da bug — uyarı log et, blokeleme.
 *
 * transports: navigator.credentials.create dönüşünde alınır; sonraki
 * authentication çağrısında allowCredentials.transports olarak gönderilir.
 */
export interface UserPasskey {
  id: string
  userId: string
  /** Cihaz adı — kullanıcı listede ayırt etsin diye ("MacBook TouchID" vb.) */
  name: string
  /** base64url credentialID — WebAuthn lookup key. */
  credentialID: string
  /** base64url COSE public key. */
  publicKey: string
  counter: number
  transports?: string[]
  createdAt: Date
  lastUsedAt?: Date | null
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function listForUser(userId: string): Promise<UserPasskey[]> {
  const c = await col()
  const docs = await c.find({ userId }).sort({ createdAt: -1 }).toArray()
  return docs.map(toId) as UserPasskey[]
}

export async function findByCredentialID(
  credentialID: string,
): Promise<UserPasskey | null> {
  const c = await col()
  const doc = await c.findOne({ credentialID })
  return toId(doc) as UserPasskey | null
}

export async function create(data: {
  userId: string
  name: string
  credentialID: string
  publicKey: string
  counter: number
  transports?: string[]
}): Promise<UserPasskey> {
  const c = await col()
  const now = new Date()
  const doc = {
    userId: data.userId,
    name: data.name,
    credentialID: data.credentialID,
    publicKey: data.publicKey,
    counter: data.counter,
    transports: data.transports ?? [],
    createdAt: now,
    lastUsedAt: null as Date | null,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

export async function updateCounterAndUsed(
  credentialID: string,
  counter: number,
): Promise<void> {
  const c = await col()
  await c.updateOne(
    { credentialID },
    { $set: { counter, lastUsedAt: new Date() } },
  )
}

export async function deleteByIdForUser(
  userId: string,
  id: string,
): Promise<boolean> {
  const c = await col()
  const result = await c.deleteOne({ _id: toObjectId(id), userId })
  return result.deletedCount === 1
}

// ── Challenge storage ────────────────────────────────────────────────────────

const CHALLENGE_COLLECTION = "passkey_challenges"
const CHALLENGE_TTL_SECONDS = 5 * 60

/**
 * Server-issued WebAuthn challenge'i kısa süreli (5dk) saklar.
 *
 * - Registration: `key` = userId (logged in user)
 * - Authentication: `key` = cryptographic random string (server üretir,
 *   client begin response'unda alır, complete'te geri gönderir)
 *
 * TTL index `expiresAt` üzerinde — kullanılmayan challenge'lar otomatik
 * temizlenir. Tek kullanımlık olduğu için complete'te delete'liyoruz.
 */
function challengeCol() {
  return getDb().then((db) => db.collection(CHALLENGE_COLLECTION))
}

export async function storeChallenge(
  key: string,
  challenge: string,
  type: "registration" | "authentication",
): Promise<void> {
  const c = await challengeCol()
  const now = new Date()
  await c.updateOne(
    { key },
    {
      $set: {
        key,
        challenge,
        type,
        expiresAt: new Date(now.getTime() + CHALLENGE_TTL_SECONDS * 1000),
        createdAt: now,
      },
    },
    { upsert: true },
  )
}

export async function consumeChallenge(
  key: string,
): Promise<string | null> {
  const c = await challengeCol()
  const doc = (await c.findOneAndDelete({ key })) as unknown as
    | { challenge?: string; expiresAt?: Date }
    | null
  if (!doc) return null
  if (doc.expiresAt && doc.expiresAt < new Date()) return null
  return doc.challenge ?? null
}
