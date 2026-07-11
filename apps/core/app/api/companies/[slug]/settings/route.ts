export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyOwnerOrAdmin } from "@workspace/console/lib/company-access"
import { audit } from "@workspace/console/lib/audit"
import {
  companyModel,
  planModel,
  companyMemberModel,
  bucketModel,
} from "@workspace/db/models"
import { createSentroyClient } from "@/lib/sentroy"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  const access = await assertCompanyOwnerOrAdmin(request, slug)
  if ("error" in access) return access.error

  const company = await companyModel.findBySlug(slug)
  if (!company) {
    return jsonError("Company not found", 404)
  }

  let plan = null
  if (company.planId) {
    plan = await planModel.findById(company.planId)
  }

  const usage: Record<string, number> = {
    domains: 0,
    members: 0,
    mailboxes: 0,
    storageBytes: 0,
  }

  try {
    const members = await companyMemberModel.findByCompany(company.id)
    usage.members = members.length
  } catch {}

  try {
    const buckets = await bucketModel.findByCompany(company.id)
    const bucketBytes = buckets.reduce((sum, b) => sum + b.storageUsed, 0)
    usage.storageBytes = (company.mailStorageUsed ?? 0) + bucketBytes
  } catch {}

  if (company.sentroyApiKey) {
    const sentroy = createSentroyClient(company.sentroyApiKey)
    try {
      const domains = await sentroy.domains.list()
      usage.domains = domains.data?.length ?? 0
    } catch {}
    try {
      const mailboxes = await sentroy.mailboxes.list()
      usage.mailboxes = mailboxes.data?.length ?? 0
    } catch {}
  }

  return jsonSuccess({
    ...company,
    usage,
    membership: access.member
      ? { role: access.member.role }
      : { role: "admin" },
    plan: plan
      ? {
          id: plan.id,
          name: plan.name,
          description: plan.description,
          maxDomainsPerCompany: plan.maxDomainsPerCompany,
          maxMembersPerCompany: plan.maxMembersPerCompany,
          maxMailboxesPerCompany: plan.maxMailboxesPerCompany,
          maxContacts: plan.maxContacts,
          storageLimit: plan.storageLimit,
          monthlyEmailLimit: plan.monthlyEmailLimit,
        }
      : null,
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  const access = await assertCompanyOwnerOrAdmin(request, slug)
  if ("error" in access) return access.error

  const company = await companyModel.findBySlug(slug)
  if (!company) {
    return jsonError("Company not found", 404)
  }

  let body: {
    name?: string
    slug?: string
    description?: string | null
    coverImageUrl?: string | null
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const updates: Record<string, unknown> = {}

  if (body.name && typeof body.name === "string" && body.name.trim()) {
    updates.name = body.name.trim()
  }

  if (body.description !== undefined) {
    updates.description =
      typeof body.description === "string"
        ? body.description.slice(0, 280)
        : null
  }

  if (body.coverImageUrl !== undefined) {
    if (body.coverImageUrl === null || body.coverImageUrl === "") {
      updates.coverImageUrl = null
    } else if (
      typeof body.coverImageUrl === "string" &&
      /^https?:\/\//.test(body.coverImageUrl)
    ) {
      updates.coverImageUrl = body.coverImageUrl
    } else {
      return jsonError("coverImageUrl must be an http(s) URL")
    }
  }

  if (body.slug !== undefined) {
    const newSlug =
      typeof body.slug === "string" ? body.slug.trim().toLowerCase() : ""
    if (!newSlug) {
      return jsonError("Slug cannot be empty")
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(newSlug)) {
      return jsonError(
        "Slug must contain only lowercase letters, numbers, and single hyphens between them",
      )
    }
    if (newSlug !== company.slug) {
      const existing = await companyModel.findBySlug(newSlug)
      if (existing && existing.id !== company.id) {
        return jsonError("This slug is already taken", 409)
      }
      updates.slug = newSlug
    }
  }

  if (Object.keys(updates).length === 0) {
    return jsonError("No valid fields to update")
  }

  const updated = await companyModel.updateById(company.id, updates as never)
  if (!updated) {
    return jsonError("Failed to update company", 500)
  }

  audit({
    request,
    userId: access.session?.user.id ?? "",
    companyId: company.id,
    action: "company.update",
    resource: "company",
    resourceId: company.id,
    details: updates,
  })

  return jsonSuccess(updated)
}
