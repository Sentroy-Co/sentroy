export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import { contactModel } from "@workspace/db/models"
import type { ContactStatus } from "@workspace/db/types"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug, "audience.manage")
  if ("error" in access) return access.error

  try {
    const url = new URL(request.url)
    const q = url.searchParams.get("q")

    // Quick search mode — autocomplete için
    if (q) {
      const contacts = await contactModel.searchByEmail(access.companyId, q, 10)
      return jsonSuccess(contacts)
    }

    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10))
    const limit = Math.min(
      100,
      Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10))
    )
    const status = url.searchParams.get("status") as ContactStatus | null
    const tagsParam = url.searchParams.get("tags")
    const tags = tagsParam ? tagsParam.split(",").filter(Boolean) : undefined

    const contacts = await contactModel.findByCompany(access.companyId, {
      status: status ?? undefined,
      tags,
      limit,
      skip: (page - 1) * limit,
    })
    const total = await contactModel.countByCompany(access.companyId)

    return jsonSuccess({ contacts, total, page, limit })
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to list contacts"
    return jsonError(message, 500)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug, "audience.manage")
  if ("error" in access) return access.error

  let body: {
    email?: string
    name?: string
    tags?: string[]
    metadata?: Record<string, unknown>
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (!body.email || typeof body.email !== "string" || !body.email.trim()) {
    return jsonError("Email is required")
  }

  try {
    const contact = await contactModel.create({
      companyId: access.companyId,
      email: body.email.trim(),
      name: body.name?.trim(),
      tags: body.tags ?? [],
      metadata: body.metadata ?? {},
      status: "active",
    })
    return jsonSuccess(contact, 201)
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to create contact"
    return jsonError(message, 500)
  }
}
