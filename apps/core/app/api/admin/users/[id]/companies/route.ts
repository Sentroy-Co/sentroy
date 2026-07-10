import { NextRequest } from "next/server"
import {
  getAuthSession,
  jsonError,
  jsonSuccess,
} from "@workspace/console/lib/api-helpers"
import {
  companyMemberModel,
  companyModel,
  planModel,
} from "@workspace/db/models"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET — bir kullanıcının üye olduğu şirketler (admin user detay diyaloğu). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  const { id } = await params
  const memberships = await companyMemberModel.findByUser(id)

  const items = await Promise.all(
    memberships.map(async (m) => {
      const company = await companyModel.findById(m.companyId)
      if (!company) return null
      let planName: string | null = null
      if (company.planId) {
        const plan = await planModel.findById(company.planId)
        planName = plan?.name?.en ?? plan?.name?.tr ?? null
      }
      return {
        companyId: m.companyId,
        name: company.name,
        slug: company.slug,
        avatarUrl: company.avatarUrl ?? null,
        role: m.role,
        status: m.status,
        planId: company.planId ?? null,
        planName,
        isOwner: company.ownerId === id,
      }
    }),
  )

  return jsonSuccess(items.filter(Boolean))
}
