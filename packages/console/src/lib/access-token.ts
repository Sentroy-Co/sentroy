import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@workspace/db/client"
import * as AccessTokenModel from "@workspace/db/models/access-token"
import { getAuthSession, jsonError } from "./api-helpers"
import { hasPermission } from "@workspace/auth/server/permissions"
import type { CompanyMember, Permission } from "@workspace/db/types"

export interface ResolvedCompanyAccess {
  /** Cookie session ile geldi ise set. Token erişiminde null. */
  session: Awaited<ReturnType<typeof getAuthSession>> | null
  /** Raw company document — _id dahil, collection'dan direkt geliyor. */
  company: { _id: unknown; [key: string]: unknown }
  companyId: string
  /** Session auth'inde user'ın üyelik kaydı; token auth'inde null. */
  member: CompanyMember | null
  /** true ise Bearer stk_... token, false ise cookie session. */
  isTokenAccess: boolean
  /**
   * Audit için user id. Session modunda session.user.id, token modunda
   * token'ı oluşturan kullanıcı (accessToken.createdById). Yazım
   * operasyonlarında media.uploadedBy gibi alanlarda kullanılır.
   */
  callerUserId: string
  /** Session modunda user.email; token modunda undefined. */
  callerEmail?: string
}

/**
 * Session (cookie) veya access token (`Authorization: Bearer stk_...`)
 * doğrulaması. Her ikisi de aynı company/membership'e çözüldüğü için
 * API route'ları tek path üzerinden her iki auth modunu da destekler.
 *
 * Token modu `isTokenAccess: true` döner + `session: null` + `member: null`.
 * Token'ın companyId'si route'taki slug ile eşleşmelidir — aksi halde 403.
 *
 * Permission zorunlu ise sadece session modunda kontrol edilir: token'ın
 * kendisi oluşturulurken scope/permissions tanımlandı ve DB seviyesinde
 * company'ye bağlı; bu aşamada ek kontrol yok. (Gelecekte token-level
 * permission eklenirse burada kontrol edilebilir.)
 */
export async function resolveCompanyAccess(
  request: NextRequest,
  slug: string,
  requiredPermission?: Permission,
): Promise<{ error: NextResponse } | ResolvedCompanyAccess> {
  const db = await getDb()

  // Token mode
  const bearerToken = extractBearerToken(request)
  if (bearerToken) {
    const accessToken = await AccessTokenModel.findByToken(bearerToken)
    if (!accessToken) {
      return {
        error: jsonError(
          `Access token not recognized (prefix ${bearerToken.slice(0, 12)}). ` +
            `It may be revoked or expired.`,
          401,
        ),
      }
    }

    const company = await db
      .collection("companies")
      .findOne({
        _id: new (await import("mongodb")).ObjectId(accessToken.companyId),
      })
    if (!company) {
      return {
        error: jsonError(
          "Token is valid but its company record is missing",
          404,
        ),
      }
    }
    if (company.slug !== slug) {
      return {
        error: jsonError(
          `Token belongs to "${company.slug}", not "${slug}"`,
          403,
        ),
      }
    }

    return {
      session: null,
      company,
      companyId: company._id.toString(),
      member: null,
      isTokenAccess: true,
      callerUserId: accessToken.createdById,
    }
  }

  // Session mode
  const session = await getAuthSession(request)
  if (!session) {
    return { error: jsonError("Unauthorized", 401) }
  }

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
  const isSystemAdmin = (session.user as { role?: string }).role === "admin"

  if (!rawMember && !isSystemAdmin) {
    return { error: jsonError("Not a member", 403) }
  }

  if (requiredPermission) {
    const allowed = await hasPermission(session, slug, requiredPermission)
    if (!allowed) {
      return { error: jsonError("Insufficient permissions", 403) }
    }
  }

  const member: CompanyMember | null = rawMember
    ? {
        id: rawMember._id.toString(),
        companyId,
        userId: rawMember.userId,
        role: rawMember.role,
        status: rawMember.status,
        permissions: rawMember.permissions,
        joinedAt: rawMember.joinedAt,
        updatedAt: rawMember.updatedAt,
      }
    : null

  return {
    session,
    company,
    companyId,
    member,
    isTokenAccess: false,
    callerUserId: session.user.id,
    callerEmail: session.user.email,
  }
}

function extractBearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization")
  if (!header) return null
  const [scheme, token] = header.split(" ", 2)
  if (scheme?.toLowerCase() !== "bearer" || !token) return null
  if (!token.startsWith("stk_")) return null
  return token
}
