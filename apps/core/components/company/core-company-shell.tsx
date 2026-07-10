"use client"

import { useEffect, type ReactNode } from "react"
import { AppShell } from "@workspace/console/components/layout/app-shell"
import { useCompanyStore } from "@workspace/console/stores/company"
import type { Company, CompanyMember } from "@workspace/db/types"

/**
 * Core'da bir company-context'li sayfa (settings, vb.) için ortak client
 * sarmalayıcı. Server'dan gelen `company` + `membership`'i company store'a
 * basıyor — TeamSwitcher header'da hidrate gelir, hover settings butonu
 * role'e uygun render olur.
 *
 * AppShell ile sarılı: Logo sol, TeamSwitcher orta, NavUser sağ. App
 * picker / company picker ile aynı chrome — sayfa geçişlerinde tutarlı.
 *
 * Mail/storage'taki büyük company layout'undan (sidebar + breadcrumb +
 * notifications) farklı olarak core minimal kalır — burada sidebar yok,
 * çünkü core'da company-içi ayrı sayfa hierarchisine ihtiyaç yok şu an.
 */
export function CoreCompanyShell({
  company,
  membership,
  children,
}: {
  company: Company
  membership: CompanyMember
  children: ReactNode
}) {
  const setActiveCompany = useCompanyStore((s) => s.setActiveCompany)

  useEffect(() => {
    setActiveCompany(company, membership)
  }, [company, membership, setActiveCompany])

  // Settings tek-kolon profile-style render olduğundan narrow body
  // (max-w-3xl) — sidebar yokluğunun yarattığı geniş whitespace'i
  // kapatır, içerik makul okuma genişliğinde kalır.
  return <AppShell width="narrow">{children}</AppShell>
}
