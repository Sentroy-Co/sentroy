"use client"

import { useParams } from "next/navigation"
import { EnvVaultContent } from "@/components/admin/env-vault-content"

/**
 * vault.sentroy.com end-user UI — proxy.ts subdomain rewrite ile
 * `/[lang]/d/[slug]/vault`'a düşer. Aynı `EnvVaultContent` component'ini
 * per-company API base ile render eder.
 */
export default function CompanyVaultPage() {
  const params = useParams<{ "company-slug": string }>()
  const slug = params["company-slug"]
  return (
    <EnvVaultContent apiBase={`/api/companies/${slug}/env-vault`} />
  )
}
