"use client"

import { useEffect } from "react"
import { useCompanyStore } from "@workspace/console/stores/company"
import { useCompanyDataStore } from "@workspace/console/stores/company-data"
import type { Company, CompanyMember } from "@workspace/db/types"

interface CompanyProviderProps {
  company: Company
  membership: CompanyMember
  children: React.ReactNode
  /**
   * Domains listesini arka planda hidrate et. Mail app domain verification
   * için ihtiyaç duyar; storage gibi domain'siz app'lerde `false` geçilerek
   * kapatılır (aksi halde `/api/companies/:slug/domains` 404 döner).
   */
  fetchDomains?: boolean
}

export function CompanyProvider({
  company,
  membership,
  children,
  fetchDomains = true,
}: CompanyProviderProps) {
  const setActiveCompany = useCompanyStore((s) => s.setActiveCompany)
  const fetchDomainsAction = useCompanyDataStore((s) => s.fetchDomains)

  useEffect(() => {
    setActiveCompany(company, membership)
    if (fetchDomains) {
      fetchDomainsAction(company.slug)
    }
  }, [company, membership, setActiveCompany, fetchDomainsAction, fetchDomains])

  return <>{children}</>
}
