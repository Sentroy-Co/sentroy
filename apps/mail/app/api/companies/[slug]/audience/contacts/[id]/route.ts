import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import { contactModel } from "@workspace/db/models"
import type { ContactStatus } from "@workspace/db/types"

const VALID_STATUSES: ContactStatus[] = ["active", "unsubscribed", "bounced"]

function isValidStatus(value: unknown): value is ContactStatus {
  return (
    typeof value === "string" &&
    VALID_STATUSES.includes(value as ContactStatus)
  )
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params
  const access = await assertCompanyAccess(request, slug, "audience.manage")
  if ("error" in access) return access.error

  let body: {
    email?: string
    name?: string
    tags?: string[]
    status?: string
    metadata?: Record<string, unknown>
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  // Status verildiyse ContactStatus enum'una göre doğrula
  if (body.status !== undefined && !isValidStatus(body.status)) {
    return jsonError(
      `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`,
    )
  }

  try {
    // IDOR guard: kontak bu company'ye ait değilse 404.
    const existing = await contactModel.findById(id)
    if (!existing || existing.companyId !== access.companyId) {
      return jsonError("Contact not found", 404)
    }
    const updated = await contactModel.updateById(id, {
      email: body.email,
      name: body.name,
      tags: body.tags,
      metadata: body.metadata,
      status: body.status as ContactStatus | undefined,
    })
    if (!updated) {
      return jsonError("Contact not found", 404)
    }
    return jsonSuccess(updated)
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to update contact"
    return jsonError(message, 500)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params
  const access = await assertCompanyAccess(request, slug, "audience.manage")
  if ("error" in access) return access.error

  try {
    // IDOR guard: kontak bu company'ye ait değilse 404.
    const existing = await contactModel.findById(id)
    if (!existing || existing.companyId !== access.companyId) {
      return jsonError("Contact not found", 404)
    }
    const updated = await contactModel.updateById(id, {
      status: "unsubscribed" as const,
    })
    if (!updated) {
      return jsonError("Contact not found", 404)
    }
    return jsonSuccess({ message: "Contact deleted" })
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to delete contact"
    return jsonError(message, 500)
  }
}
