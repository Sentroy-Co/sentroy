import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "auth_project_user_passkeys"

/**
 * WebAuthn / FIDO2 passkey credential — bir kullanıcı için birden çok
 * kayıtlı authenticator (TouchID, YubiKey, Windows Hello, vb.).
 *
 * Register flow: client'ten public key + credentialId + counter alınır,
 * burada saklanır. Auth flow: client signed challenge gönderir, server
 * stored public key ile verify eder.
 */

export type PasskeyTransport = "usb" | "ble" | "nfc" | "internal" | "hybrid"

export interface AuthProjectUserPasskey {
  id: string
  authProjectId: string
  userId: string
  /** Base64URL credential ID — WebAuthn spec'inde RP authenticator'ı bu ile
   *  tanır. Lookup index için unique. */
  credentialId: string
  /** Base64-encoded public key (CBOR'dan extract edilmiş COSE key). */
  publicKey: string
  /** Signature counter — replay attack koruması. Her auth'ta artar. */
  counter: number
  /** Authenticator transport hints — auth flow'da prompt için. */
  transports: PasskeyTransport[]
  /** Optional kullanıcı tarafından verilen ad ("MacBook TouchID" gibi). */
  deviceName: string | null
  lastUsedAt: Date | null
  createdAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

// ─── Queries ──────────────────────────────────────────────────────────────

export async function findByCredentialId(
  credentialId: string,
): Promise<AuthProjectUserPasskey | null> {
  const c = await col()
  const doc = await c.findOne({ credentialId })
  return doc ? toId(doc) : null
}

export async function listByUser(
  userId: string,
): Promise<AuthProjectUserPasskey[]> {
  const c = await col()
  const docs = await c.find({ userId }).sort({ createdAt: -1 }).toArray()
  return docs.map((d) => toId(d) as AuthProjectUserPasskey)
}

// ─── Mutations ────────────────────────────────────────────────────────────

export async function create(input: {
  authProjectId: string
  userId: string
  credentialId: string
  publicKey: string
  counter: number
  transports?: PasskeyTransport[]
  deviceName?: string | null
}): Promise<AuthProjectUserPasskey> {
  const c = await col()
  const now = new Date()
  const doc = {
    authProjectId: input.authProjectId,
    userId: input.userId,
    credentialId: input.credentialId,
    publicKey: input.publicKey,
    counter: input.counter,
    transports: input.transports ?? [],
    deviceName: input.deviceName ?? null,
    lastUsedAt: null as Date | null,
    createdAt: now,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

export async function updateCounter(
  credentialId: string,
  newCounter: number,
): Promise<void> {
  const c = await col()
  await c.updateOne(
    { credentialId },
    { $set: { counter: newCounter, lastUsedAt: new Date() } },
  )
}

export async function rename(
  id: string,
  userId: string,
  newName: string,
): Promise<boolean> {
  const c = await col()
  const r = await c.updateOne(
    { _id: toObjectId(id), userId },
    { $set: { deviceName: newName.trim() || null } },
  )
  return (r.modifiedCount ?? 0) > 0
}

export async function remove(id: string, userId: string): Promise<boolean> {
  const c = await col()
  const r = await c.deleteOne({ _id: toObjectId(id), userId })
  return (r.deletedCount ?? 0) > 0
}

export async function removeByUser(userId: string): Promise<number> {
  const c = await col()
  const r = await c.deleteMany({ userId })
  return r.deletedCount ?? 0
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ credentialId: 1 }, { unique: true })
  await c.createIndex({ userId: 1 })
  await c.createIndex({ authProjectId: 1 })
}
