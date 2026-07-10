import { create } from "zustand"

/** Catch-all rule snapshot — `null` ise rule yok. `enabled: false` ise
 *  rule var ama UI tarafında devre dışı (kullanıcı geçici olarak kapattı). */
export interface DomainCatchAll {
  targetMailboxEmail: string
  enabled: boolean
}

interface Domain {
  id: string
  name: string
  status: string
  /** API enrichment'tan gelen catch-all snapshot'u. UI catch-all olan
   *  domain'lerde rozet gösterir, mailbox create select'inde ilgili
   *  domain'i disabled yapar. */
  catchAll: DomainCatchAll | null
}

interface CompanyDataStore {
  slug: string | null
  domains: Domain[]
  domainsLoading: boolean
  domainsLoaded: boolean
  /** En az bir dogrulanmis (active) domain var mi */
  hasVerifiedDomain: boolean

  setSlug: (slug: string) => void
  fetchDomains: (slug: string, force?: boolean) => Promise<void>
  invalidateDomains: () => void
  reset: () => void
}

export const useCompanyDataStore = create<CompanyDataStore>((set, get) => ({
  slug: null,
  domains: [],
  domainsLoading: false,
  domainsLoaded: false,
  hasVerifiedDomain: false,

  setSlug: (slug) => {
    if (get().slug !== slug) {
      set({ slug, domains: [], domainsLoaded: false, hasVerifiedDomain: false })
    }
  },

  fetchDomains: async (slug, force = false) => {
    const state = get()
    if (!force && state.domainsLoaded && state.slug === slug) return
    if (state.domainsLoading) return

    set({ domainsLoading: true, slug })
    try {
      const res = await fetch(`/api/companies/${slug}/domains`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to load domains")
      const list = (json.data as Record<string, unknown>[]) ?? []
      const mapped: Domain[] = list.map((d) => ({
        id: d.id as string,
        name: (d.domain ?? d.name) as string,
        status: (d.status as string) ?? "unknown",
        catchAll:
          (d.catchAll as DomainCatchAll | null | undefined) ?? null,
      }))
      const hasVerified = mapped.some((d) => d.status === "active")
      set({ domains: mapped, domainsLoaded: true, domainsLoading: false, hasVerifiedDomain: hasVerified })
    } catch {
      set({ domainsLoading: false })
    }
  },

  invalidateDomains: () => set({ domainsLoaded: false }),

  reset: () =>
    set({
      slug: null,
      domains: [],
      domainsLoading: false,
      domainsLoaded: false,
      hasVerifiedDomain: false,
    }),
}))
