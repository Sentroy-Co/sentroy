import { create } from "zustand"
import type { Company, CompanyMember } from "@workspace/db/types"

/** Company switcher'da gosterilen hafif kayit. */
export interface CompanyListItem {
  id: string
  name: string
  slug: string
  avatarUrl?: string | null
  role?: CompanyMember["role"]
}

interface CompanyStore {
  /** O an aktif (URL'deki) company. Layout tarafindan set edilir. */
  activeCompany: Company | null
  /** Aktif company'deki kullanici uyeligi. */
  membership: CompanyMember | null

  /** Kullanicinin uyesi oldugu tum company'ler (switcher icin). */
  companies: CompanyListItem[]
  companiesLoading: boolean
  companiesLoaded: boolean

  setActiveCompany: (company: Company, membership: CompanyMember) => void
  /** Aktif company'nin field'larını yerinde güncelle — settings'te avatar
   *  veya isim değişince store'u senkron tutar; sidebar/switcher anlık yansır. */
  patchActiveCompany: (patch: Partial<Company>) => void
  clearCompany: () => void

  /** GET /api/companies — fetch-once, `force` ile yeniden yuklenir. */
  fetchCompanies: (force?: boolean) => Promise<void>
  /** Cache'i tazele (yeni company eklendi/silindi). */
  invalidateCompanies: () => void
}

export const useCompanyStore = create<CompanyStore>((set, get) => ({
  activeCompany: null,
  membership: null,

  companies: [],
  companiesLoading: false,
  companiesLoaded: false,

  setActiveCompany: (company, membership) =>
    set({ activeCompany: company, membership }),

  patchActiveCompany: (patch) =>
    set((state) =>
      state.activeCompany
        ? { activeCompany: { ...state.activeCompany, ...patch } }
        : state,
    ),

  clearCompany: () => set({ activeCompany: null, membership: null }),

  fetchCompanies: async (force = false) => {
    const state = get()
    if (!force && state.companiesLoaded) return
    if (state.companiesLoading) return

    set({ companiesLoading: true })
    try {
      const res = await fetch("/api/companies")
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to load companies")
      const list = Array.isArray(json.data) ? json.data : []
      const mapped: CompanyListItem[] = list.map(
        (c: {
          id: string
          name: string
          slug: string
          avatarUrl?: string | null
          membership?: { role: CompanyMember["role"] }
        }) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          avatarUrl: c.avatarUrl ?? null,
          role: c.membership?.role,
        }),
      )
      set({
        companies: mapped,
        companiesLoaded: true,
        companiesLoading: false,
      })
    } catch {
      set({ companiesLoading: false })
    }
  },

  invalidateCompanies: () => set({ companiesLoaded: false }),
}))
