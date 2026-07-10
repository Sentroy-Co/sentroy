import { getDb } from "../client"

const COLLECTION = "system_settings"
const KEY = "system-mail"

export interface SystemMailSettings {
  /** Sistem mail'lerinde "from" olarak kullanılacak doğrulanmış domain id —
   *  sentroy mail server'daki domain doc id'si. Null ise sistem mail send
   *  devre dışı (better-auth verification email vb. gönderilmez). */
  systemMailDomainId: string | null
  /** "from" adresinin local part'ı (örn `noreply@<domain>`). */
  fromAddress: string
  updatedAt?: Date
}

export const DEFAULT_SETTINGS: SystemMailSettings = {
  systemMailDomainId: null,
  fromAddress: "noreply",
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function get(): Promise<SystemMailSettings> {
  const c = await col()
  const doc = await c.findOne({ key: KEY })
  if (!doc) return DEFAULT_SETTINGS
  const { _id: _i, key: _k, ...rest } = doc as Record<string, unknown>
  return { ...DEFAULT_SETTINGS, ...(rest as object) } as SystemMailSettings
}

export async function update(
  patch: Partial<SystemMailSettings>,
): Promise<SystemMailSettings> {
  const c = await col()
  await c.updateOne(
    { key: KEY },
    { $set: { ...patch, updatedAt: new Date() } },
    { upsert: true },
  )
  return get()
}
