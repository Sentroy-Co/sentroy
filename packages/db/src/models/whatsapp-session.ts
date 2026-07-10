import { getDb } from "../client"
import { toId } from "./_helpers"

/**
 * WhatsApp Santral — şirketin bağlı WhatsApp Web oturumları.
 *
 * Çoklu numara: bir şirket N numara bağlayabilir; her numara bir `sessionId`
 * (company içinde benzersiz) ile temsil edilir. `label` kullanıcı etiketi
 * ("Satış", "Destek"). Tüm alt veriler (auth-key, contact, message, media)
 * `(companyId, sessionId)` ile scope'lanır.
 *
 * `credsBlob` Baileys `AuthenticationCreds`'in AES-256-GCM şifreli JSON'u —
 * plaintext ASLA saklanmaz. Signal anahtarları ayrı koleksiyonda
 * ([[whatsapp-auth-key]]).
 */

const COLLECTION = "whatsapp_sessions"

export type WhatsappSessionStatus =
  | "disconnected"
  | "connecting"
  | "qr"
  | "connected"

export interface WhatsappSession {
  id: string
  companyId: string
  /** Company içinde benzersiz numara/oturum kimliği. */
  sessionId: string
  /** Kullanıcı etiketi ("Satış Hattı" vb.). */
  label: string | null
  status: WhatsappSessionStatus
  phoneNumber: string | null
  pushName: string | null
  credsBlob: string | null
  lastConnectedAt: Date | null
  lastQrAt: Date | null
  createdAt: Date
  updatedAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function listByCompany(
  companyId: string,
): Promise<WhatsappSession[]> {
  const c = await col()
  const docs = await c.find({ companyId }).sort({ createdAt: 1 }).toArray()
  return docs.map(toId)
}

export async function getBySession(
  companyId: string,
  sessionId: string,
): Promise<WhatsappSession | null> {
  const c = await col()
  return toId(await c.findOne({ companyId, sessionId }))
}

export async function create(
  companyId: string,
  sessionId: string,
  label?: string | null,
): Promise<WhatsappSession> {
  const c = await col()
  const now = new Date()
  const doc = {
    companyId,
    sessionId,
    label: label ?? null,
    status: "disconnected" as WhatsappSessionStatus,
    phoneNumber: null,
    pushName: null,
    credsBlob: null,
    lastConnectedAt: null,
    lastQrAt: null,
    createdAt: now,
    updatedAt: now,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

export async function upsertStatus(
  companyId: string,
  sessionId: string,
  patch: {
    status?: WhatsappSessionStatus
    phoneNumber?: string | null
    pushName?: string | null
    lastConnectedAt?: Date | null
    lastQrAt?: Date | null
  },
): Promise<WhatsappSession> {
  const c = await col()
  const now = new Date()
  const set: Record<string, unknown> = { updatedAt: now }
  if (patch.status !== undefined) set.status = patch.status
  if (patch.phoneNumber !== undefined) set.phoneNumber = patch.phoneNumber
  if (patch.pushName !== undefined) set.pushName = patch.pushName
  if (patch.lastConnectedAt !== undefined)
    set.lastConnectedAt = patch.lastConnectedAt
  if (patch.lastQrAt !== undefined) set.lastQrAt = patch.lastQrAt

  const result = await c.findOneAndUpdate(
    { companyId, sessionId },
    {
      $set: set,
      $setOnInsert: {
        companyId,
        sessionId,
        label: null,
        credsBlob: null,
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: "after" },
  )
  return toId(result)
}

export async function saveCreds(
  companyId: string,
  sessionId: string,
  credsBlob: string,
): Promise<void> {
  const c = await col()
  const now = new Date()
  await c.updateOne(
    { companyId, sessionId },
    {
      $set: { credsBlob, updatedAt: now },
      $setOnInsert: {
        companyId,
        sessionId,
        label: null,
        status: "connecting",
        createdAt: now,
      },
    },
    { upsert: true },
  )
}

export async function clearSession(
  companyId: string,
  sessionId: string,
): Promise<void> {
  const c = await col()
  await c.updateOne(
    { companyId, sessionId },
    {
      $set: {
        status: "disconnected",
        credsBlob: null,
        phoneNumber: null,
        pushName: null,
        updatedAt: new Date(),
      },
    },
  )
}

/** Gateway boot'ta sessizce yeniden bağlanacak oturumlar (creds'i olanlar). */
export async function listResumable(): Promise<WhatsappSession[]> {
  const c = await col()
  const docs = await c
    .find({ credsBlob: { $ne: null }, status: { $ne: "disconnected" } })
    .toArray()
  return docs.map(toId)
}

export async function deleteSession(
  companyId: string,
  sessionId: string,
): Promise<void> {
  const c = await col()
  await c.deleteOne({ companyId, sessionId })
}

export async function deleteByCompany(companyId: string): Promise<void> {
  const c = await col()
  await c.deleteMany({ companyId })
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ companyId: 1, sessionId: 1 }, { unique: true })
  await c.createIndex({ companyId: 1 })
}
