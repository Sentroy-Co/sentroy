import { NextRequest } from "next/server"
import {
  getAuthSession,
  jsonError,
  jsonSuccess,
} from "@workspace/console/lib/api-helpers"
import { companyModel, companyMemberModel } from "@workspace/db/models"

/**
 * GET /api/profile/c/[slug]
 *
 * Returns the public face of a company profile. Visibility is intranet
 * only — the caller must be a member of the company. Anonymous viewers
 * and non-members get a 404 (we obscure existence rather than leak
 * "this company exists but you can't see it").
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  if (!slug) return jsonError("Slug required", 400)

  const company = await companyModel.findBySlug(slug.toLowerCase())
  if (!company) return jsonError("Profile not found", 404)

  const session = await getAuthSession(request)
  if (!session) return jsonError("Profile not found", 404)

  const member = await companyMemberModel.findByCompanyAndUser(
    company.id,
    session.user.id,
  )
  if (!member || member.status !== "active") {
    return jsonError("Profile not found", 404)
  }

  let memberCount = 0
  try {
    const all = await companyMemberModel.findByCompany(company.id)
    memberCount = all.filter((m) => m.status === "active").length
  } catch {
    /* fallthrough — UI tolerates missing count */
  }

  return jsonSuccess({
    id: company.id,
    slug: company.slug,
    name: company.name,
    avatarUrl: company.avatarUrl ?? null,
    coverImageUrl: company.coverImageUrl ?? null,
    description: company.description ?? null,
    memberCount,
    createdAt: company.createdAt ?? null,
    canManage: member.role === "owner" || member.role === "admin",
  })
}
