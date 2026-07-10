import { NextRequest } from "next/server"
import { getAuthSession, jsonError, jsonSuccess, slugify } from "@workspace/console/lib/api-helpers"
import { companyModel, companyMemberModel } from "@workspace/db/models"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)

  const { slug } = await params
  const company = await companyModel.findBySlug(slug)
  if (!company) return jsonError("Company not found", 404)

  const member = await companyMemberModel.findByCompanyAndUser(
    company.id,
    session.user.id,
  )
  if (!member) return jsonError("You are not a member of this company", 403)

  return jsonSuccess({
    ...company,
    membership: {
      role: member.role,
      permissions: member.permissions,
      status: member.status,
    },
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)

  const { slug } = await params
  const company = await companyModel.findBySlug(slug)
  if (!company) return jsonError("Company not found", 404)

  const member = await companyMemberModel.findByCompanyAndUser(
    company.id,
    session.user.id,
  )
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    return jsonError("You do not have permission to update this company", 403)
  }

  let body: { name?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const updates: Record<string, unknown> = {}
  if (body.name && typeof body.name === "string" && body.name.trim()) {
    const name = body.name.trim()
    const newSlug = slugify(name)
    if (!newSlug) return jsonError("Company name produces an invalid slug")
    if (newSlug !== company.slug) {
      const existing = await companyModel.findBySlug(newSlug)
      if (existing) return jsonError("A company with this name already exists")
    }
    updates.name = name
    updates.slug = newSlug
  }
  if (Object.keys(updates).length === 0) return jsonError("No valid fields to update")

  const updated = await companyModel.updateById(company.id, updates as any)
  if (!updated) return jsonError("Failed to update company", 500)
  return jsonSuccess(updated)
}
