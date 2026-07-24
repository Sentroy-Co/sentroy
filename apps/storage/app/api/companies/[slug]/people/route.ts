export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { companyMemberModel, authUserModel } from "@workspace/db/models"

/**
 * Şirket dizini — dosya paylaşımı kişi seçici için. Yalnız aktif üyeler
 * (kendini çıkar), iletişim yüzeyi (ad/e-posta/avatar). Meet'in people
 * endpoint'iyle aynı desen; storage.view yeterli (üyelik gate'i).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await resolveCompanyAccess(request, slug, "storage.view")
  if ("error" in access) return access.error

  const members = await companyMemberModel.findByCompany(access.companyId)
  const active = members.filter((m) => m.status === "active")
  const users = await authUserModel.findByIds(active.map((m) => m.userId))

  const people = active
    .filter((m) => m.userId !== access.callerUserId)
    .map((m) => {
      const u = users.get(m.userId)
      return {
        userId: m.userId,
        name: u?.name ?? null,
        email: u?.email ?? null,
        image: u?.image ?? null,
      }
    })
    .filter((p) => Boolean(p.email))
    .sort((a, b) =>
      (a.name || a.email || "").localeCompare(b.name || b.email || ""),
    )
    .slice(0, 200)

  return jsonSuccess({ people })
}
