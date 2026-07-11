export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { companyModel, companyMemberModel } from "@workspace/db/models"
import { SYSTEM_COMPANY_SLUG } from "@workspace/db/constants"

/**
 * GET — kullanıcının üye olduğu tüm company'leri döner. CompanySelection
 * ekranı her subdomain'de aynı çağrıyı kendi origin'ine yapar; her app
 * kendi route'unu re-export eder. DB read-only olduğu için sade.
 */
export async function GET(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)

  const memberships = await companyMemberModel.findByUser(session.user.id)
  const companies = await Promise.all(
    memberships.map(async (member) => {
      const company = await companyModel.findById(member.companyId)
      if (!company) return null
      if (company.slug === SYSTEM_COMPANY_SLUG) return null
      return {
        ...company,
        membership: {
          role: member.role,
          permissions: member.permissions,
          status: member.status,
        },
      }
    }),
  )
  return jsonSuccess(companies.filter(Boolean))
}

/**
 * POST — company create core'da merkezi (plan kontrolü, mail provision,
 * default plan resolution vb. tek yerde). Storage subdomain'inde aynı UI
 * (CompanySelection) çalıştığı için endpoint'in burada da var olması lazım,
 * yoksa "Create new" butonu 405 atar. Çözüm: server-side proxy. Cookie'yi
 * forward ediyoruz → cross-subdomain auth (`.sentroy.com`) zaten paylaşıyor,
 * core'da `getAuthSession` aynı session'ı görür.
 */
export async function POST(request: NextRequest) {
  const coreUrl = process.env.NEXT_PUBLIC_CORE_APP_URL
  if (!coreUrl) {
    return jsonError("NEXT_PUBLIC_CORE_APP_URL not configured", 500)
  }

  const body = await request.text()
  const res = await fetch(`${coreUrl.replace(/\/+$/, "")}/api/companies`, {
    method: "POST",
    headers: {
      "Content-Type":
        request.headers.get("content-type") || "application/json",
      Cookie: request.headers.get("cookie") || "",
    },
    body,
  })

  const text = await res.text()
  return new Response(text, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  })
}
