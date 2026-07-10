import { getDb } from "../client"

const COLLECTION = "system_settings"
const KEY = "tool_pack_products"

/**
 * Singleton — tools.sentroy.com ücretli paketlerinin Polar productId eşlemesi
 * (key=`tool_pack_products`). polar-settings.ts ile aynı patern. Operatör
 * Polar'da yarattığı tek-seferlik ürünün id'sini ilgili pack'e bağlar; sandbox
 * ve production ayrı tutulur. Pack yapısı (kredi/fiyat) koddadır
 * (@workspace/console/lib/tool-packs); burada YALNIZ productId eşlemesi durur.
 */
export interface ToolPackProducts {
  /** packKey → Polar productId (sandbox ortamı). */
  sandbox: Record<string, string>
  /** packKey → Polar productId (production ortamı). */
  production: Record<string, string>
  updatedAt: Date
}

export const DEFAULT_TOOL_PACK_PRODUCTS: ToolPackProducts = {
  sandbox: {},
  production: {},
  updatedAt: new Date(0),
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function get(): Promise<ToolPackProducts> {
  const c = await col()
  const doc = await c.findOne({ key: KEY })
  if (!doc) return DEFAULT_TOOL_PACK_PRODUCTS
  const { _id: _i, key: _k, ...rest } = doc as Record<string, unknown>
  return { ...DEFAULT_TOOL_PACK_PRODUCTS, ...(rest as object) } as ToolPackProducts
}

/** Bir mod için packKey → productId döndür (yoksa null). */
export async function resolveProductId(
  packKey: string,
  mode: "sandbox" | "production",
): Promise<string | null> {
  const settings = await get()
  return settings[mode]?.[packKey] ?? null
}

export async function update(
  patch: Partial<ToolPackProducts>,
): Promise<ToolPackProducts> {
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
