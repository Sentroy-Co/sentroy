import { NextRequest, NextResponse } from "next/server"
import { jsonError } from "@workspace/console/lib/api-helpers"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import type { CompanyMember, Company, Permission } from "@workspace/db/types"
import { createSentroyClient } from "./sentroy"
import { ensureMailProvisioned } from "./provision"

type SentroyClient = ReturnType<typeof createSentroyClient>

/**
 * Mail-spesifik proxy sonucu — flat shape. Hata dalında `error` set,
 * başarı dalında `sentroy` + diğer alanlar set. Route'lar
 * `if ("error" in r && r.error) return r.error` paterni kullandığı
 * için discriminated union yerine optional-fields single type olarak
 * export ediyoruz; mevcut route'larda kod değişmez.
 */
export interface SentroyProxyResult {
  error?: NextResponse
  sentroy?: SentroyClient
  session?: Awaited<ReturnType<typeof resolveCompanyAccess>> extends infer R
    ? R extends { session: infer S }
      ? S
      : never
    : never
  // _id ObjectId olarak geldiği için .toString() ile kullanılmak üzere any;
  // route'lar bu shape'e göre yazılmış durumda.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  company?: any
  companyId?: string
  member?: CompanyMember | null
  isTokenAccess?: boolean
  callerUserId?: string
  callerEmail?: string
}

/**
 * Session/token ile company'yi çöz, sentroy mail server client'ı üret.
 * Storage bu helper'ı kullanmaz — doğrudan `resolveCompanyAccess` çağırır.
 *
 * Lazy provisioning: company.sentroyApiKey yoksa (create flow'undaki
 * background provision fail/timeout olduysa) burada bir kez denenir.
 * `ensureMailProvisioned` idempotent + DB'yi günceller, sonraki
 * çağrılar key'i cached görür. Provision da fail olursa 502 döner.
 */
export async function getSentroyForCompany(
  request: NextRequest,
  slug: string,
  requiredPermission?: Permission,
): Promise<SentroyProxyResult> {
  const resolved = await resolveCompanyAccess(request, slug, requiredPermission)
  if ("error" in resolved) return { error: resolved.error }

  let company = resolved.company as unknown as Company
  let apiKey = company.sentroyApiKey as string | undefined

  if (!apiKey) {
    try {
      company = await ensureMailProvisioned(company)
      apiKey = company.sentroyApiKey
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      return {
        error: jsonError(
          `Mail provisioning failed: ${detail}`,
          502,
        ),
      }
    }
  }

  if (!apiKey) {
    return {
      error: jsonError(
        "Mail server API key not configured for this company",
        400,
      ),
    }
  }

  return {
    sentroy: createSentroyClient(apiKey),
    session: resolved.session,
    company,
    companyId: resolved.companyId,
    member: resolved.member,
    isTokenAccess: resolved.isTokenAccess,
    callerUserId: resolved.callerUserId,
    callerEmail: resolved.callerEmail,
  }
}
