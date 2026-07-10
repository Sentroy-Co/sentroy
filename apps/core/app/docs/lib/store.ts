"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"

interface DocsStore {
  /**
   * Bearer access token used to populate every code sample on the docs
   * site. Empty until the user enters one — code blocks fall back to
   * the literal `stk_...` placeholder.
   */
  token: string
  /** Company slug used in example URLs and SDK config. */
  companySlug: string
  /** Last-seen identity tag for the cURL generator's body editor. */
  generatorBody: string
  setToken: (v: string) => void
  setCompanySlug: (v: string) => void
  setGeneratorBody: (v: string) => void
  reset: () => void
}

export const useDocsStore = create<DocsStore>()(
  persist(
    (set) => ({
      token: "",
      companySlug: "",
      generatorBody: "",
      setToken: (token) => set({ token }),
      setCompanySlug: (companySlug) => set({ companySlug }),
      setGeneratorBody: (generatorBody) => set({ generatorBody }),
      reset: () =>
        set({ token: "", companySlug: "", generatorBody: "" }),
    }),
    {
      name: "sentroy-docs",
      // Only the credentials persist; transient editor state is fine to
      // keep but we don't want a stale generator body trapped on disk.
      partialize: (s) => ({ token: s.token, companySlug: s.companySlug }),
    },
  ),
)

export {
  TOKEN_PLACEHOLDER,
  SLUG_PLACEHOLDER,
  TOKEN_MARKER,
  SLUG_MARKER,
  injectPlaceholderMarkers,
  applyPlaceholders,
  applyPlaceholdersRaw,
} from "./placeholders"
