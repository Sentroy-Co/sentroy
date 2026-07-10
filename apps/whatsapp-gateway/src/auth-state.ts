import { createRequire } from "node:module"
import type {
  AuthenticationCreds,
  AuthenticationState,
} from "@whiskeysockets/baileys"
import { whatsappSessionModel, whatsappAuthKeyModel } from "@workspace/db/models"
import { encrypt, decrypt } from "./crypto"

// Baileys CommonJS modülü; Node ESM loader'ı (production `node --import tsx`)
// `proto` gibi named export'ları algılayamıyor (cjs-lexer detection eksik).
// createRequire ile gerçek module.exports'tan al — tipler `typeof import` ile.
const nodeRequire = createRequire(import.meta.url)
const { initAuthCreds, BufferJSON, proto } = nodeRequire(
  "@whiskeysockets/baileys",
) as typeof import("@whiskeysockets/baileys")

/**
 * Baileys `AuthenticationState`'in MongoDB + AES-GCM destekli implementasyonu.
 * `useMultiFileAuthState`'in dosya-sistemi yerine DB kullanan eşdeğeri —
 * Coolify konteyner FS'i ephemeral olduğundan oturum restart'ta uçmamalı.
 *
 * - `creds` tek blob olarak [[whatsapp-session]] içinde (companyId scope).
 * - Signal anahtarları [[whatsapp-auth-key]] içinde (kategori + id'ye göre).
 * - Tüm değerler BufferJSON ile serileştirilip şifrelenir.
 */
export async function useMongoAuthState(
  companyId: string,
  sessionId: string,
): Promise<{
  state: AuthenticationState
  saveCreds: () => Promise<void>
}> {
  const session = await whatsappSessionModel.getBySession(companyId, sessionId)
  const creds: AuthenticationCreds = session?.credsBlob
    ? JSON.parse(decrypt(session.credsBlob), BufferJSON.reviver)
    : initAuthCreds()

  const keys: AuthenticationState["keys"] = {
    get: async (type, ids) => {
      const blobs = await whatsappAuthKeyModel.getMany(
        companyId,
        sessionId,
        type as string,
        ids,
      )
      const result: Record<string, unknown> = {}
      for (const id of ids) {
        const blob = blobs[id]
        if (!blob) continue
        let value = JSON.parse(decrypt(blob), BufferJSON.reviver)
        if (type === "app-state-sync-key" && value) {
          value = proto.Message.AppStateSyncKeyData.fromObject(value)
        }
        result[id] = value
      }
      // Baileys generic dönüş tipini bekler; loose impl → cast.
      return result as never
    },
    set: async (data) => {
      const entries: {
        category: string
        keyId: string
        valueBlob: string | null
      }[] = []
      for (const category of Object.keys(data)) {
        const bucket = (data as Record<string, Record<string, unknown>>)[
          category
        ]
        if (!bucket) continue
        for (const keyId of Object.keys(bucket)) {
          const value = bucket[keyId]
          entries.push({
            category,
            keyId,
            valueBlob:
              value === null || value === undefined
                ? null
                : encrypt(JSON.stringify(value, BufferJSON.replacer)),
          })
        }
      }
      await whatsappAuthKeyModel.setMany(companyId, sessionId, entries)
    },
  }

  return {
    state: { creds, keys },
    saveCreds: async () => {
      await whatsappSessionModel.saveCreds(
        companyId,
        sessionId,
        encrypt(JSON.stringify(creds, BufferJSON.replacer)),
      )
    },
  }
}
