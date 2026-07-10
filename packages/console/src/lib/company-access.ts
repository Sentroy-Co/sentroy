import { NextRequest, NextResponse } from "next/server"
import { getAuthSession, jsonError } from "./api-helpers"
import { getDb } from "@workspace/db/client"
import { hasPermission } from "@workspace/auth/server/permissions"
import type { Permission, CompanyMember } from "@workspace/db/types"

/**
 * Sirket erisimi + (opsiyonel) izin dogrulamasi yapan tek noktadan helper.
 *
 * - Oturum yoksa              → 401
 * - Sirket yoksa              → 404
 * - Uye degilse (ve system admin degilse) → 403
 * - Izin gerekiyor ama yetmezse → 403
 *
 * Sentroy client'a ihtiyaci olmayan route'lar (team, settings, vb.) bu
 * helper'i kullanir. Sentroy client gerektirenler icin bkz. `getSentroyForCompany`.
 */
export async function assertCompanyAccess(
  request: NextRequest,
  slug: string,
  requiredPermission?: Permission,
): Promise<
  | { error: NextResponse }
  | {
      session: Awaited<ReturnType<typeof getAuthSession>>
      company: { _id: unknown; [key: string]: unknown }
      companyId: string
      member: CompanyMember | null
    }
> {
  const session = await getAuthSession(request)
  if (!session) {
    return { error: jsonError("Unauthorized", 401) }
  }

  const db = await getDb()
  const company = await db.collection("companies").findOne({ slug })
  if (!company) {
    return { error: jsonError("Company not found", 404) }
  }

  const companyId = company._id.toString()

  const rawMember = await db.collection("company_members").findOne({
    companyId,
    userId: session.user.id,
    status: "active",
  })

  const isSystemAdmin =
    (session.user as { role?: string }).role === "admin"

  if (!rawMember && !isSystemAdmin) {
    return { error: jsonError("Not a member", 403) }
  }

  if (requiredPermission) {
    const allowed = await hasPermission(session, slug, requiredPermission)
    if (!allowed) {
      return { error: jsonError("Insufficient permissions", 403) }
    }
  }

  const member = rawMember
    ? ({
        id: rawMember._id.toString(),
        companyId,
        userId: rawMember.userId,
        role: rawMember.role,
        status: rawMember.status,
        permissions: rawMember.permissions,
        joinedAt: rawMember.joinedAt,
        updatedAt: rawMember.updatedAt,
      } as CompanyMember)
    : null

  return { session, company, companyId, member }
}

/**
 * Yalnizca owner veya admin role'unun erisebildigi rotalar icin helper.
 * Settings sayfasi gibi permission flag'i olmayan yerlerde kullanilir.
 */
export async function assertCompanyOwnerOrAdmin(
  request: NextRequest,
  slug: string,
) {
  const result = await assertCompanyAccess(request, slug)
  if ("error" in result) return result

  const isSystemAdmin =
    (result.session?.user as { role?: string } | undefined)?.role === "admin"
  const isOwnerOrAdmin =
    result.member?.role === "owner" || result.member?.role === "admin"

  if (!isSystemAdmin && !isOwnerOrAdmin) {
    return { error: jsonError("Insufficient permissions", 403) }
  }

  return result
}
