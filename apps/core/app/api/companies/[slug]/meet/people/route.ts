export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import { jsonSuccess } from "@workspace/console/lib/api-helpers"
import { authUserModel, companyMemberModel } from "@workspace/db/models"

/**
 * GET /api/companies/[slug]/meet/people — şirket rehberi (meet daveti için).
 *
 * AKTİF ÜYELİK yeterli (permission şartı yok — `mention-search` ile aynı bar):
 * bir şirket içi rehber, üyenin meslektaşını toplantıya davet edebilmesi için
 * isim + e-posta + avatar döner. `team` route'u (members.manage) rol/izin gibi
 * yönetim verisi taşıdığı için fazla yetkili; burada yalnız iletişim yüzeyi var.
 * Kendisi listeden düşülür (kendini davet etmek anlamsız).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug)
  if ("error" in access) return access.error

  const members = await companyMemberModel.findByCompany(access.companyId)
  const active = members.filter((m) => m.status === "active")
  const users = await authUserModel.findByIds(active.map((m) => m.userId))
  const callerId = access.session?.user.id

  const people = active
    .filter((m) => m.userId !== callerId)
    .map((m) => {
      const u = users.get(m.userId)
      return {
        userId: m.userId,
        name: u?.name ?? null,
        email: u?.email ?? null,
        image: u?.image ?? null,
        role: m.role,
      }
    })
    .filter((p) => Boolean(p.email))
    .sort((a, b) => (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? ""))
    .slice(0, 100)

  return jsonSuccess({ people })
}
