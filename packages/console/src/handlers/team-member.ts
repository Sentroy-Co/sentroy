import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import { companyMemberModel } from "@workspace/db/models"
import { getDb } from "@workspace/db/client"
import { ObjectId } from "mongodb"
import type { Permission, CompanyMemberRole } from "@workspace/db/types"
import { audit } from "@workspace/console/lib/audit"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; memberId: string }> },
) {
  const { slug, memberId } = await params

  const access = await assertCompanyAccess(request, slug, "members.manage")
  if ("error" in access) return access.error

  const members = await companyMemberModel.findByCompany(access.companyId)
  const targetMember = members.find((m) => m.id === memberId)
  if (!targetMember) {
    return jsonError("Member not found", 404)
  }

  if (targetMember.role === "owner") {
    return jsonError("Cannot modify the owner", 403)
  }

  let body: {
    role?: string
    permissions?: string[]
    status?: string
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const updates: Record<string, unknown> = {}

  if (body.role && (body.role === "admin" || body.role === "member")) {
    updates.role = body.role as CompanyMemberRole
  }

  if (body.permissions && Array.isArray(body.permissions)) {
    updates.permissions = body.permissions as Permission[]
  }

  if (
    body.status &&
    (body.status === "active" || body.status === "suspended")
  ) {
    updates.status = body.status
  }

  if (Object.keys(updates).length === 0) {
    return jsonError("No valid fields to update")
  }

  const updated = await companyMemberModel.updateById(memberId, updates as any)
  if (!updated) {
    return jsonError("Failed to update member", 500)
  }

  audit({
    request,
    userId: access.session?.user.id ?? "",
    companyId: access.companyId,
    action: "member.update",
    resource: "member",
    resourceId: memberId,
    details: updates,
  })

  const db = await getDb()
  const user = await db
    .collection("user")
    .findOne({ _id: new ObjectId(updated.userId) })

  return jsonSuccess({
    ...updated,
    user: user
      ? { name: user.name, email: user.email, image: user.image }
      : { name: "Unknown", email: "", image: null },
  })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; memberId: string }> },
) {
  const { slug, memberId } = await params

  const access = await assertCompanyAccess(request, slug, "members.manage")
  if ("error" in access) return access.error

  const members = await companyMemberModel.findByCompany(access.companyId)
  const targetMember = members.find((m) => m.id === memberId)
  if (!targetMember) {
    return jsonError("Member not found", 404)
  }

  if (targetMember.role === "owner") {
    return jsonError("Cannot remove the owner", 403)
  }

  const deleted = await companyMemberModel.deleteById(memberId)
  if (!deleted) {
    return jsonError("Failed to remove member", 500)
  }

  audit({
    request,
    userId: access.session?.user.id ?? "",
    companyId: access.companyId,
    action: "member.remove",
    resource: "member",
    resourceId: memberId,
    details: { removedUserId: targetMember.userId, role: targetMember.role },
  })

  return jsonSuccess({ deleted: true })
}
