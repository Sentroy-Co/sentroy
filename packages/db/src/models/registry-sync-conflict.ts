import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "registry_sync_conflicts"

/**
 * App Store registry sync çakışma kaydı — merkezi katalog (source="registry")
 * ile yerel kayıtlar (dashboard/github/personal) arasında appId/slug çakışması
 * VEYA bir katalog satırının yerel uygulanamaması durumunda yazılır.
 *
 * Politika: registry-wins-WITH-QUARANTINE — sync ASLA yerel bir kaydı ezmez,
 * ASLA unique index üzerinde yakalanmamış bir E11000 üretmez. Çakışan katalog
 * satırı atlanır + burada karantinaya alınır + admin bildirimi. Operatör
 * (rename/force-adopt/allowlist) çözünceye kadar global app gizli kalır.
 *
 * Yalnız instance-side sync client yazar (APP_REGISTRY_ENABLED yoksa hiç
 * yazılmaz — bu koleksiyon self-host dışında boştur).
 */

export type RegistrySyncConflictReason =
  | "slug-collision" // katalog appId'sinin slug'ını farklı bir appId'li yerel kayıt tutuyor
  | "appid-squatted-by-local" // appId zaten var ama source!=="registry" (yerel sahiplenmiş)
  | "manifest-invalid" // katalog satırının manifestSnapshot'ı strict parseManifest'ten geçmedi
  | "row-error" // satır uygulanırken beklenmeyen hata (sync abort etmez, karantina + devam)

export interface RegistrySyncConflict {
  id: string
  /** Çakışan katalog satırının manifest appId'si. */
  appId: string
  /** Katalog satırının slug'ı (varsa). */
  slug: string | null
  /** Çakışan yerel kaydın _id'si (varsa). */
  localAppId: string | null
  /** Çakışan yerel kaydın source'u (varsa). */
  localSource: string | null
  reason: RegistrySyncConflictReason
  /** Çakışmanın görüldüğü katalog versiyonu (izlenebilirlik). */
  catalogVersion: string | null
  /** Serbest metin ayrıntı (log/admin görünümü). */
  detail: string | null
  detectedAt: Date
  resolvedAt: Date | null
  resolvedBy: string | null
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

/**
 * Bir çakışmayı kaydet. Aynı (appId, reason) için çözülmemiş bir kayıt varsa
 * `detectedAt`'i tazeler (her sync'te yeni doc üretip kuyruğu şişirmez);
 * yoksa yeni doc açar.
 */
export async function record(input: {
  appId: string
  slug?: string | null
  localAppId?: string | null
  localSource?: string | null
  reason: RegistrySyncConflictReason
  catalogVersion?: string | null
  detail?: string | null
}): Promise<void> {
  const c = await col()
  const now = new Date()
  await c.updateOne(
    { appId: input.appId, reason: input.reason, resolvedAt: null },
    {
      $set: {
        appId: input.appId,
        slug: input.slug ?? null,
        localAppId: input.localAppId ?? null,
        localSource: input.localSource ?? null,
        reason: input.reason,
        catalogVersion: input.catalogVersion ?? null,
        detail: input.detail ?? null,
        detectedAt: now,
        resolvedAt: null,
      },
      $setOnInsert: { resolvedBy: null },
    },
    { upsert: true },
  )
}

export async function list(opts: { unresolvedOnly?: boolean } = {}): Promise<RegistrySyncConflict[]> {
  const c = await col()
  const filter = opts.unresolvedOnly ? { resolvedAt: null } : {}
  const docs = await c.find(filter).sort({ detectedAt: -1 }).toArray()
  return docs.map(toId)
}

export async function countUnresolved(): Promise<number> {
  const c = await col()
  return c.countDocuments({ resolvedAt: null })
}

export async function resolve(id: string, adminUserId: string): Promise<boolean> {
  const c = await col()
  const result = await c.updateOne(
    { _id: toObjectId(id) },
    { $set: { resolvedAt: new Date(), resolvedBy: adminUserId } },
  )
  return result.modifiedCount === 1
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  // Aynı (appId, reason) çözülmemiş çakışma tekilliği (record() upsert'ü buna dayanır).
  await c.createIndex({ appId: 1, reason: 1, resolvedAt: 1 })
  await c.createIndex({ resolvedAt: 1, detectedAt: -1 })
}
