import { NextRequest } from "next/server"
import { ObjectId } from "mongodb"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyOwnerOrAdmin } from "@workspace/console/lib/company-access"
import {
  companyModel,
  companyMemberModel,
  companyOwnershipTransferModel,
} from "@workspace/db/models"
import { getDb } from "@workspace/db/client"
import { audit } from "@workspace/console/lib/audit"
import { sendSystemMailEvent } from "@workspace/auth/server/system-mail-events"
import {
  isFreeCompany,
  countFreeOwnedCompanies,
  MAX_FREE_COMPANIES,
} from "@workspace/console/lib/company-limits"

/**
 * POST — şirket sahipliği devrini BAŞLAT (owner-only). Hedef bir mevcut üye.
 * 6 haneli onay kodu owner'ın e-postasına gider; devir /verify ile tamamlanır.
 * Kod response'ta DÖNMEZ. Tüm app'lere re-export edilir (paylaşılan team UI).
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

  let body: { memberId?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }
  const memberId = typeof body.memberId === "string" ? body.memberId : ""
  if (!memberId) return jsonError("memberId is required")

  const members = await companyMemberModel.findByCompany(access.companyId)
  const target = members.find((m) => m.id === memberId)
  if (!target || target.status !== "active") {
    return jsonError("Member not found", 404)
  }
  if (target.role === "owner") return jsonError("This member is already the owner")
  if (target.userId === session.user.id) {
    return jsonError("You cannot transfer ownership to yourself")
  }

  const company = await companyModel.findById(access.companyId)
  if (!company) return jsonError("Company not found", 404)

  // Free-plan sahiplik sınırı — hedef bu free şirketi alınca 2'yi aşmamalı.
  if (isFreeCompany(company)) {
    const targetFree = await countFreeOwnedCompanies(target.userId)
    if (targetFree >= MAX_FREE_COMPANIES) {
      return jsonError(
        `This member already owns the maximum of ${MAX_FREE_COMPANIES} free-plan companies and cannot receive another.`,
        403,
      )
    }
  }

  // Hedef kullanıcı adı (e-posta değişkeni için).
  let targetName = target.userId
  if (ObjectId.isValid(target.userId)) {
    const db = await getDb()
    const u = await db.collection("user").findOne({ _id: new ObjectId(target.userId) })
    targetName = (u?.name as string) || (u?.email as string) || target.userId
  }

  const { code } = await companyOwnershipTransferModel.create({
    companyId: access.companyId,
    initiatedBy: session.user.id,
    targetUserId: target.userId,
    targetMemberId: target.id,
  })

  const mail = await sendSystemMailEvent("company.ownership-transfer-code", {
    to: session.user.email,
    variables: {
      ownerName: session.user.name || session.user.email,
      companyName: company.name,
      targetName,
      code,
    },
  })

  audit({
    request,
    userId: session.user.id,
    companyId: access.companyId,
    action: "company.transfer-initiated",
    resource: "company",
    resourceId: access.companyId,
    details: { targetUserId: target.userId, targetMemberId: target.id },
  })

  return jsonSuccess({ sent: mail.sent, reason: mail.reason ?? null })
}
