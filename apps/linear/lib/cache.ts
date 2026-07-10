/**
 * Process-içi TTL cache (triage app/lib/cache.server.ts portu).
 *
 * ⚠️ MULTI-TENANT KURAL: Linear Lite company-scoped olduğundan cache
 * key'lerinin İSTİSNASIZ `companyId` ile prefix'lenmesi ZORUNLU — aksi halde
 * bir şirketin Linear verisi başka şirkete sızar. `companyKey(companyId, key)`
 * helper'ını ya da `${ctx.companyId}:linear:…` şablonunu kullan.
 */

type Entry<T> = { value: T; expiresAt: number }

class TTLCache {
  private store = new Map<string, Entry<unknown>>()

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key)
      return undefined
    }
    return entry.value as T
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs })
  }

  async wrap<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const cached = this.get<T>(key)
    if (cached !== undefined) return cached
    const value = await fn()
    this.set(key, value, ttlMs)
    return value
  }

  invalidate(prefix?: string): void {
    if (!prefix) {
      this.store.clear()
      return
    }
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key)
    }
  }

  size(): number {
    return this.store.size
  }
}

export const cache = new TTLCache()

export const TTL = {
  HOUR: 60 * 60 * 1000,
  QUARTER_HOUR: 15 * 60 * 1000,
  FIVE_MIN: 5 * 60 * 1000,
  MIN: 60 * 1000,
} as const

/** Tenant-izole cache key'i: `${companyId}:${key}`. */
export function companyKey(companyId: string, key: string): string {
  return `${companyId}:${key}`
}

/**
 * Bir şirketin TÜM cache girdilerini düşürür. Linear API key / takım /
 * ayar değişikliğinde (linear-settings PUT) çağır — bayat workspace verisi
 * yeni bağlantıya taşınmasın.
 */
export function invalidateCompanyCache(companyId: string): void {
  cache.invalidate(`${companyId}:`)
}
