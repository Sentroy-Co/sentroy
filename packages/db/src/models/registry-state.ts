import { getDb } from "../client"

const COLLECTION = "system_settings"
const KEY = "registry_state"

/**
 * App Store registry sync durumu — singleton (system_settings, key=`registry_state`).
 * featured-apps.ts ile aynı spread-over-default patern (admin-kaydedilmiş boş
 * liste korunur).
 *
 * Güvenlik defansları burada tutulur:
 *  - lastCatalogVersion + lastCatalogGeneratedAt: MONOTONIC FLOOR — sync,
 *    versiyonu/üretim-zamanı bu taban <= olan bir katalogu reddeder (rollback/
 *    downgrade guard).
 *  - revokedTombstones: STICKY revocation — merkezi olarak iptal edilen appId'ler
 *    buraya append edilir; sonraki sync'ler açık bir un-revoke olmadan geri açmaz.
 *  - blockedAppIds: operatör kalıcı blocklist'i — bu appId'ler asla (yeniden)
 *    oluşturulmaz.
 *  - localFeaturedOverride: yerel admin Editor's Choice sıralaması (katalog
 *    editorsChoice'unu EZMEZ — okuma-tarafı merge, yerel kazanır).
 *
 * Doc yoksa hiçbir read yolu buna danışmaz (registry rows yoksa etkisiz).
 */
export interface RegistryState {
  lastSyncAt: Date | null
  lastCatalogVersion: string | null
  /** C2 monotonic floor — kabul edilen son katalogun generatedAt'i. */
  lastCatalogGeneratedAt: Date | null
  lastError: string | null
  /** C2 sticky revocation — iptal edilmiş appId'ler (append-only). */
  revokedTombstones: string[]
  /** Operatör kalıcı blocklist'i. */
  blockedAppIds: string[]
  /** Yerel admin Editor's Choice sıralaması (opsiyonel; katalogu ezmez). */
  localFeaturedOverride: string[] | null
  /** Katalogun editorsChoice'u (okuma-tarafı; featured_apps'i EZMEZ, merge edilir). */
  catalogFeatured: string[]
  updatedAt: Date
}

const DEFAULT_STATE: RegistryState = {
  lastSyncAt: null,
  lastCatalogVersion: null,
  lastCatalogGeneratedAt: null,
  lastError: null,
  revokedTombstones: [],
  blockedAppIds: [],
  localFeaturedOverride: null,
  catalogFeatured: [],
  updatedAt: new Date(0),
}

/** Saklanan doc = RegistryState + singleton `key`. Array alanlar tipli olsun ki
 *  $pull/$addToSet operatörleri (PullOperator/PushOperator) doğru çözülsün. */
type RegistryStateDoc = RegistryState & { key: string }

function col() {
  return getDb().then((db) => db.collection<RegistryStateDoc>(COLLECTION))
}

export async function get(): Promise<RegistryState> {
  const c = await col()
  const doc = await c.findOne({ key: KEY })
  if (!doc) return DEFAULT_STATE
  const { _id: _i, key: _k, ...rest } = doc as Record<string, unknown>
  return { ...DEFAULT_STATE, ...(rest as object) } as RegistryState
}

async function patch(set: Partial<RegistryStateDoc>): Promise<void> {
  const c = await col()
  await c.updateOne(
    { key: KEY },
    { $set: { ...set, updatedAt: new Date() } },
    { upsert: true },
  )
}

/** Başarılı bir sync sonrası floor'u ilerlet (version + generatedAt). */
export async function setSyncResult(input: {
  version: string
  generatedAt: Date
  error?: string | null
}): Promise<void> {
  await patch({
    lastSyncAt: new Date(),
    lastCatalogVersion: input.version,
    lastCatalogGeneratedAt: input.generatedAt,
    lastError: input.error ?? null,
  })
}

/** Sync bir hatayla (imza/freshness/floor) abort ettiğinde floor'u ilerletmeden hata yaz. */
export async function setSyncError(error: string): Promise<void> {
  await patch({ lastSyncAt: new Date(), lastError: error })
}

/** İptal edilen appId'leri tombstone set'ine ekle (append-only, sticky). */
export async function recordRevoked(appIds: string[]): Promise<void> {
  if (appIds.length === 0) return
  const c = await col()
  await c.updateOne(
    { key: KEY },
    {
      $addToSet: { revokedTombstones: { $each: appIds } },
      $set: { updatedAt: new Date() },
    },
    { upsert: true },
  )
}

export async function isRevoked(appId: string): Promise<boolean> {
  const s = await get()
  return s.revokedTombstones.includes(appId)
}

/**
 * Açık un-revoke — yalnız operatör admin aksiyonuyla; sonraki sync appId'yi
 * yeniden oluşturabilir. (Sticky tombstone'un tek çıkışı.)
 */
export async function unrevoke(appId: string): Promise<void> {
  const c = await col()
  await c.updateOne(
    { key: KEY },
    { $pull: { revokedTombstones: appId }, $set: { updatedAt: new Date() } },
  )
}

export async function block(appId: string): Promise<void> {
  const c = await col()
  await c.updateOne(
    { key: KEY },
    { $addToSet: { blockedAppIds: appId }, $set: { updatedAt: new Date() } },
    { upsert: true },
  )
}

export async function unblock(appId: string): Promise<void> {
  const c = await col()
  await c.updateOne(
    { key: KEY },
    { $pull: { blockedAppIds: appId }, $set: { updatedAt: new Date() } },
  )
}

export async function isBlocked(appId: string): Promise<boolean> {
  const s = await get()
  return s.blockedAppIds.includes(appId)
}

export async function setLocalFeatured(appIds: string[]): Promise<void> {
  await patch({ localFeaturedOverride: Array.from(new Set(appIds)) })
}

export async function clearLocalFeatured(): Promise<void> {
  await patch({ localFeaturedOverride: null })
}

export async function getLocalFeatured(): Promise<string[] | null> {
  const s = await get()
  return s.localFeaturedOverride
}

/** Katalogun editorsChoice'unu sakla (sync sonu). featured_apps'e YAZMAZ. */
export async function setCatalogFeatured(appIds: string[]): Promise<void> {
  await patch({ catalogFeatured: Array.from(new Set(appIds)) })
}

export async function getCatalogFeatured(): Promise<string[]> {
  const s = await get()
  return s.catalogFeatured
}

export async function ensureIndexes(): Promise<void> {
  // Singleton — `{ key }` ile findOne; ek index gerekmiyor (featured-apps.ts ile aynı).
}
