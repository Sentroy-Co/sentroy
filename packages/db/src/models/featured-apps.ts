import { getDb } from "../client"

const COLLECTION = "system_settings"
const KEY = "featured_apps"

/**
 * Singleton — App Store "Editor's Choice" birleşik sıralı seçkisi
 * (key=`featured_apps`). system-product.ts ile aynı patern.
 *
 * `editorsChoice` sıralı bir appId listesidir; hem first-party ham id
 * ("status", "whatsapp", …) hem 3rd-party manifest appId'lerini karışık
 * içerebilir (birleşik seçki). Sıra korunur (admin yukarı/aşağı taşır).
 * Store bu listeyi çözüp öne-çıkan kartları render eder.
 */
export interface FeaturedApps {
  /** Sıralı appId listesi (first-party ham id VEYA 3rd-party manifest appId). */
  editorsChoice: string[]
  updatedAt: Date
}

export const DEFAULT_FEATURED_APPS: FeaturedApps = {
  // Hiç ayarlanmamışken (doc yok) flagship first-party app'ler öne çıkar —
  // Editor's Choice bölümü boş görünmesin ve bu 4 app keşfedilebilsin. Admin
  // bir liste kaydedince (boş dahil) `get()` spread'i bunu override eder;
  // yani admin'in boşaltması korunur (default yalnız "hiç set edilmemiş" hali).
  // NOT: db paketi apps/core katalogunu import edemez — id'ler stabil olduğundan
  // sabit yazıldı (first-party-catalog.ts ile senkron tut).
  editorsChoice: ["status", "whatsapp", "studio", "opencut"],
  updatedAt: new Date(0),
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function get(): Promise<FeaturedApps> {
  const c = await col()
  const doc = await c.findOne({ key: KEY })
  if (!doc) return DEFAULT_FEATURED_APPS
  const { _id: _i, key: _k, ...rest } = doc as Record<string, unknown>
  return { ...DEFAULT_FEATURED_APPS, ...(rest as object) } as FeaturedApps
}

/** Sıralı Editor's Choice appId listesini döndür. */
export async function getEditorsChoice(): Promise<string[]> {
  const settings = await get()
  return settings.editorsChoice
}

/** Editor's Choice listesini set et (sıralı; tekrarlar temizlenir). */
export async function setEditorsChoice(appIds: string[]): Promise<FeaturedApps> {
  const c = await col()
  const unique = Array.from(new Set(appIds))
  await c.updateOne(
    { key: KEY },
    { $set: { editorsChoice: unique, updatedAt: new Date() } },
    { upsert: true },
  )
  return get()
}

export async function ensureIndexes(): Promise<void> {
  // Singleton — `{ key }` ile findOne; ek index gerekmiyor.
}
