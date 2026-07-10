import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "oauth_consents"

/**
 * Per-(user, client) consent kaydı — kullanıcı bir RP için bir scope set'ini
 * onayladığında upsert edilir. Sonraki authorize akışında aynı (ya da
 * subset) scope istense consent ekranı atlanır + code direkt issue edilir
 * → "Sign in with Sentroy" tek tıkla biter.
 *
 * Yeni / daha geniş scope istenirse (grantedScopes ⊃ requested değilse)
 * consent ekranı tekrar gösterilir ve onay sonrası kayıt güncellenir.
 *
 * Kullanıcı dashboard'dan "Revoke app access" ile bu kaydı silebilir
 * (şu an UI yok; model + endpoint hazır, gelecek tur).
 */

export interface OAuthConsent {
  id: string
  userId: string
  clientId: string
  /** Onaylanan scope'ların union'ı — yeni scope istense expand edilir. */
  scopes: string[]
  grantedAt: Date
  updatedAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function find(
  userId: string,
  clientId: string,
): Promise<OAuthConsent | null> {
  const c = await col()
  const doc = await c.findOne({ userId, clientId })
  return doc ? toId(doc) : null
}

export async function findByUser(userId: string): Promise<OAuthConsent[]> {
  const c = await col()
  const docs = await c
    .find({ userId })
    .sort({ updatedAt: -1 })
    .toArray()
  return docs.map(toId)
}

/**
 * Upsert — istenen scope'ları mevcut grant'a ekler (union). Daraltma
 * yapmaz; kullanıcı "revoke" ile tüm kaydı silmeli.
 */
export async function grant(input: {
  userId: string
  clientId: string
  scopes: string[]
}): Promise<OAuthConsent> {
  const c = await col()
  const now = new Date()
  const existing = await c.findOne({
    userId: input.userId,
    clientId: input.clientId,
  })
  if (existing) {
    const merged = Array.from(
      new Set([...(existing.scopes as string[]), ...input.scopes]),
    )
    await c.updateOne(
      { _id: existing._id },
      { $set: { scopes: merged, updatedAt: now } },
    )
    return toId({ ...existing, scopes: merged, updatedAt: now })
  }
  const doc = {
    userId: input.userId,
    clientId: input.clientId,
    scopes: input.scopes,
    grantedAt: now,
    updatedAt: now,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

/** Tüm scope'lar mevcut grant'ın subset'i mi (consent ekranını skip için). */
export function covers(consent: OAuthConsent | null, requested: string[]): boolean {
  if (!consent) return false
  const granted = new Set(consent.scopes)
  for (const s of requested) {
    if (!granted.has(s)) return false
  }
  return true
}

/** Kullanıcı RP'ye verdiği erişimi geri çeker. */
export async function revoke(id: string): Promise<boolean> {
  const c = await col()
  const r = await c.deleteOne({ _id: toObjectId(id) })
  return r.deletedCount === 1
}

/** Kullanıcı + client çiftini doğrudan sil (revoke from authorize-side helper). */
export async function revokeForUserClient(
  userId: string,
  clientId: string,
): Promise<boolean> {
  const c = await col()
  const r = await c.deleteOne({ userId, clientId })
  return r.deletedCount === 1
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ userId: 1, clientId: 1 }, { unique: true })
  await c.createIndex({ clientId: 1 })
}
