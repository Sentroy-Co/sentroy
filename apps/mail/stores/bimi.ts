import { create } from "zustand"

export interface BimiData {
  logoUrl: string | null
  vmcUrl: string | null
  found: boolean
}

interface BimiStore {
  /** domain → BIMI bilgisi */
  cache: Record<string, BimiData>
  /** Su anda resolve edilen domain'ler (yeniden istek onleme) */
  inflight: Set<string>
  /** Tek bir domain icin BIMI cozumle (cache varsa gonderir) */
  resolve: (domain: string) => Promise<BimiData | null>
  /** Birden fazla domain icin batch cozumle — yeni olanlari toplu ister */
  resolveMany: (domains: string[]) => Promise<void>
}

export const useBimiStore = create<BimiStore>((set, get) => ({
  cache: {},
  inflight: new Set<string>(),

  async resolve(rawDomain: string) {
    const domain = rawDomain.trim().toLowerCase()
    if (!domain) return null
    const state = get()
    if (state.cache[domain]) return state.cache[domain]
    if (state.inflight.has(domain)) return null

    state.inflight.add(domain)
    try {
      const res = await fetch(`/api/bimi?domain=${encodeURIComponent(domain)}`)
      const json = await res.json()
      const data: BimiData = json.data || {
        logoUrl: null,
        vmcUrl: null,
        found: false,
      }
      set((s) => ({ cache: { ...s.cache, [domain]: data } }))
      return data
    } catch {
      const data: BimiData = { logoUrl: null, vmcUrl: null, found: false }
      set((s) => ({ cache: { ...s.cache, [domain]: data } }))
      return data
    } finally {
      state.inflight.delete(domain)
    }
  },

  async resolveMany(rawDomains: string[]) {
    const state = get()
    const normalized = Array.from(
      new Set(
        rawDomains
          .map((d) => d.trim().toLowerCase())
          .filter(Boolean),
      ),
    )
    const toFetch = normalized.filter(
      (d) => !state.cache[d] && !state.inflight.has(d),
    )
    if (toFetch.length === 0) return

    // Inflight isaretle
    toFetch.forEach((d) => state.inflight.add(d))

    try {
      const res = await fetch(
        `/api/bimi?domain=${encodeURIComponent(toFetch.join(","))}`,
      )
      const json = await res.json()
      const results: Record<string, BimiData> = json.data || {}

      set((s) => {
        const next = { ...s.cache }
        for (const d of toFetch) {
          next[d] = results[d] || {
            logoUrl: null,
            vmcUrl: null,
            found: false,
          }
        }
        return { cache: next }
      })
    } catch {
      set((s) => {
        const next = { ...s.cache }
        for (const d of toFetch) {
          next[d] = { logoUrl: null, vmcUrl: null, found: false }
        }
        return { cache: next }
      })
    } finally {
      toFetch.forEach((d) => state.inflight.delete(d))
    }
  },
}))

/** Email adresinden domain cikarir */
export function getDomainFromEmail(email: string): string {
  const at = email.lastIndexOf("@")
  if (at < 0) return ""
  return email.slice(at + 1).toLowerCase().trim()
}
