import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyOwnerOrAdmin } from "@workspace/console/lib/company-access"
import {
  companyModel,
  companyMemberModel,
  companyOwnershipTransferModel,
} from "@workspace/db/models"
import type { Permission } from "@workspace/db/types"
import { PERMISSIONS } from "@workspace/auth/server/permissions"
import { audit } from "@workspace/console/lib/audit"
import {
  isFreeCompany,
  countFreeOwnedCompanies,
  MAX_FREE_COMPANIES,
} from "@workspace/console/lib/company-limits"

/**
 * POST — devri kodla DOĞRULA + UYGULA (owner-only). Kod eşleşirse: hedef üye
 * owner (tüm izinler), mevcut owner admin'e düşer, company.ownerId güncellenir.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyOwnerOrAdmin(request, slug)
  if ("error" in access) return access.error
  const session = access.session
  if (!session) return jsonError("Unauthorized", 401)
  if (access.member?.role !== "owner") {
    return jsonError("Only the owner can transfer ownership", 403)
  }

  let body: { code?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }
  const code = (typeof body.code === "string" ? body.code : "").trim()
  if (!/^\d{6}$/.test(code)) return jsonError("Enter the 6-digit code")

  const result = await companyOwnershipTransferModel.verifyAndConsume(
    access.companyId,
    code,
  )
  if (result.status === "none") {
    return jsonError("No pending transfer, or it expired. Start again.", 400)
  }
  if (result.status === "wrong") {
    return jsonError("Incorrect code. Please try again.", 400)
  }

  const { targetUserId, targetMemberId } = result.record

  const members = await companyMemberModel.findByCompany(access.companyId)
  const target = members.find((m) => m.id === targetMemberId)
  if (!target || target.userId !== targetUserId) {
    return jsonError("The target member no longer exists", 409)
  }

  const company = await companyModel.findById(access.companyId)
  if (!company) return jsonError("Company not found", 404)

  if (isFreeCompany(company)) {
    const targetFree = await countFreeOwnedCompanies(targetUserId)
    if (targetFree >= MAX_FREE_COMPANIES) {
      return jsonError(
        `This member already owns the maximum of ${MAX_FREE_COMPANIES} free-plan companies.`,
        403,
      )
    }
  }

  const allPermissions = Object.values(PERMISSIONS) as Permission[]
  await companyMemberModel.updateById(targetMemberId, {
    role: "owner",
    permissions: allPermissions,
  })
  if (access.member) {
    await companyMemberModel.updateById(access.member.id, { role: "admin" })
  }
  await companyModel.updateById(access.companyId, { ownerId: targetUserId })

  audit({
    request,
    userId: session.user.id,
    companyId: access.companyId,
    action: "company.transfer-completed",
    resource: "company",
    resourceId: access.companyId,
    details: { fromUserId: session.user.id, toUserId: targetUserId },
  })

  return jsonSuccess({ transferred: true })
}
