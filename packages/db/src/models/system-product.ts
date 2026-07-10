import { getDb } from "../client"

const COLLECTION = "system_settings"
const KEY = "system_products"

/**
 * Singleton — sistem (ilk-parti) tek-seferlik ürünlerinin Polar productId
 * eşlemesi (key=`system_products`). tool-pack-product.ts ile aynı patern.
 * Operatör Polar'da yarattığı tek-seferlik ürünün id'sini ilgili TUTARA
 * (amountKey: "5","10",…) bağlar; sandbox ve production ayrı. Tutar kataloğu
 * koddadır (@workspace/console/lib/system-products); burada YALNIZ id eşlemesi.
 */
export interface SystemProducts {
  /** amountKey → Polar productId (sandbox ortamı). */
  sandbox: Record<string, string>
  /** amountKey → Polar productId (production ortamı). */
  production: Record<string, string>
  updatedAt: Date
}

export const DEFAULT_SYSTEM_PRODUCTS: SystemProducts = {
  sandbox: {},
  production: {},
  updatedAt: new Date(0),
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function get(): Promise<SystemProducts> {
  const c = await col()
  const doc = await c.findOne({ key: KEY })
  if (!doc) return DEFAULT_SYSTEM_PRODUCTS
  const { _id: _i, key: _k, ...rest } = doc as Record<string, unknown>
  return { ...DEFAULT_SYSTEM_PRODUCTS, ...(rest as object) } as SystemProducts
}

/** Bir mod için amountKey → productId döndür (yoksa null). */
export async function resolveProductId(
  amountKey: string,
  mode: "sandbox" | "production",
): Promise<string | null> {
  const settings = await get()
  return settings[mode]?.[amountKey] ?? null
}

export async function update(
  patch: Partial<SystemProducts>,
): Promise<SystemProducts> {
  const c = await col()
  await c.updateOne(
    { key: KEY },
    { $set: { ...patch, updatedAt: new Date() } },
    { upsert: true },
  )
  return get()
}

export async function ensureIndexes(): Promise<void> {
  // Singleton — `{ key }` ile findOne; ek index gerekmiyor.
}
